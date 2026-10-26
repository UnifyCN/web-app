"use client";

import {
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type HTMLMotionProps } from "framer-motion";
import { overlayMotion, panelMotion } from "@/lib/motion";

const subscribe = () => () => {};

/**
 * Renders `children` into <body> while `open`, and keeps them mounted long
 * enough to play their exit animation. Used by dialogs and menus.
 */
export function BodyPresence({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  // `document` doesn't exist during SSR; overlays only open on the client.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>{open && children}</AnimatePresence>,
    document.body,
  );
}

// Inert background: one registry of every mounted dialog layer, so a single
// pass decides what is inert. The topmost open dialog that asked for an inert
// background (latest opened) and every dialog opened after it stay usable;
// everything else in <body> is inert, including dialog layers that are closed
// or were opened earlier. Each held element gets back its own earlier `inert`
// value when it is no longer held.

interface LayerState {
  open: boolean;
  inertBackground: boolean;
  /** Order in which the dialog opened; 0 while closed. */
  openedAt: number;
}

const layers = new Map<HTMLElement, LayerState>();
/** Elements this module made inert, with their `inert` value from before. */
const held = new Map<HTMLElement, boolean>();
let openCount = 0;
let bodyObserver: MutationObserver | null = null;

function applyInertBackground() {
  let top = 0;
  for (const state of layers.values()) {
    if (state.open && state.inertBackground) top = Math.max(top, state.openedAt);
  }
  const wanted = new Set<HTMLElement>();
  if (top > 0) {
    const usable = new Set<HTMLElement>();
    for (const [layer, state] of layers) {
      if (state.open && state.openedAt >= top) usable.add(layer);
    }
    for (const child of Array.from(document.body.children)) {
      if (child instanceof HTMLElement && !usable.has(child)) wanted.add(child);
    }
  }
  for (const [el, was] of held) {
    if (wanted.has(el)) continue;
    held.delete(el);
    el.inert = was;
  }
  for (const el of wanted) {
    if (held.has(el)) continue;
    held.set(el, el.inert);
    el.inert = true;
  }
  // Elements added to <body> while a dialog holds the page (a toast, a
  // portal, another dialog layer) are sorted on arrival.
  if (top > 0 && !bodyObserver) {
    bodyObserver = new MutationObserver(applyInertBackground);
    bodyObserver.observe(document.body, { childList: true });
  } else if (top === 0 && bodyObserver) {
    bodyObserver.disconnect();
    bodyObserver = null;
  }
}

/** Registers this dialog's layer and keeps its open/inert state current. */
function useDialogLayer(
  layerRef: RefObject<HTMLElement | null>,
  open: boolean,
  inertBackground: boolean,
  mounted: boolean,
) {
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const before = layers.get(layer);
    layers.set(layer, {
      open,
      inertBackground,
      openedAt: open ? (before?.open ? before.openedAt : ++openCount) : 0,
    });
    applyInertBackground();
  }, [layerRef, open, inertBackground, mounted]);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    return () => {
      layers.delete(layer);
      if (held.has(layer)) {
        layer.inert = held.get(layer)!;
        held.delete(layer);
      }
      applyInertBackground();
    };
  }, [layerRef, mounted]);
}

/**
 * Enter/exit motion shared by every dialog. Wrap the dialog's markup in
 * `DialogPresence`, use `DialogOverlay` for the backdrop and `DialogPanel` for
 * the box: the backdrop fades, the panel settles in, and both leave as a plain
 * fade. Focus, scroll lock and Escape stay with each dialog, keyed on `open`,
 * so they never wait for the animation.
 *
 * With `inertBackground`, the rest of the page is inert while the dialog is
 * open (a true modal for keyboard, pointer and assistive tech), and it gets
 * its earlier state back as soon as the dialog closes, before the exit fade.
 * Any dialog opened later on top of it stays usable, whether it was mounted
 * earlier (closed) or mounted on opening.
 *
 * Renders into <body> inside its own layer, so a `fixed` overlay always
 * covers the viewport and stacks above the nav whatever its ancestors do.
 */
export function DialogPresence({
  open,
  inertBackground = false,
  children,
}: {
  open: boolean;
  inertBackground?: boolean;
  children: ReactNode;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  useDialogLayer(layerRef, open, inertBackground, mounted);
  if (!mounted) return null;
  return createPortal(
    <div ref={layerRef} data-dialog-layer="" className="contents">
      <AnimatePresence>{open && children}</AnimatePresence>
    </div>,
    document.body,
  );
}

export function DialogOverlay(props: HTMLMotionProps<"div">) {
  return <motion.div {...overlayMotion} {...props} />;
}

export function DialogPanel(props: HTMLMotionProps<"div">) {
  return <motion.div {...panelMotion} {...props} />;
}
