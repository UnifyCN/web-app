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

// How many open dialogs hold each background element inert, and its own
// `inert` value from before the first one, so nested dialogs and elements the
// app made inert itself come back exactly as they were.
const inertHolds = new WeakMap<HTMLElement, { count: number; was: boolean }>();

function holdInert(el: HTMLElement) {
  const hold = inertHolds.get(el);
  if (hold) {
    hold.count += 1;
    return;
  }
  inertHolds.set(el, { count: 1, was: el.inert });
  el.inert = true;
}

function releaseInert(el: HTMLElement) {
  const hold = inertHolds.get(el);
  if (!hold) return;
  hold.count -= 1;
  if (hold.count > 0) return;
  inertHolds.delete(el);
  el.inert = hold.was;
}

/**
 * While `active`, makes everything in <body> except this dialog's own layer
 * inert: no focus, no pointer input, and out of the accessibility tree.
 * Elements added to <body> meanwhile (a toast, a portal) are covered too; a
 * dialog layer opened later on top is not. Released on close and on unmount.
 */
function useInertBackground(active: boolean, layerRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!active || !layer) return;
    const held = new Set<HTMLElement>();
    const hold = (node: Node) => {
      if (!(node instanceof HTMLElement) || node === layer || held.has(node)) return;
      holdInert(node);
      held.add(node);
    };
    for (const child of Array.from(document.body.children)) hold(child);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement && node.hasAttribute("data-dialog-layer")) return;
          hold(node);
        });
      }
    });
    observer.observe(document.body, { childList: true });
    return () => {
      observer.disconnect();
      held.forEach(releaseInert);
    };
  }, [active, layerRef]);
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
  useInertBackground(open && inertBackground, layerRef);
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
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
