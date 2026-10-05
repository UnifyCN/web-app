"use client";

import { useSyncExternalStore, type ReactNode } from "react";
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

/**
 * Enter/exit motion shared by every dialog. Wrap the dialog's markup in
 * `DialogPresence`, use `DialogOverlay` for the backdrop and `DialogPanel` for
 * the box: the backdrop fades, the panel settles in, and both leave as a plain
 * fade. Focus, scroll lock and Escape stay with each dialog, keyed on `open`,
 * so they never wait for the animation.
 *
 * Renders into <body>, so a `fixed` overlay always covers the viewport and
 * stacks above the nav whatever its ancestors do.
 */
export const DialogPresence = BodyPresence;

export function DialogOverlay(props: HTMLMotionProps<"div">) {
  return <motion.div {...overlayMotion} {...props} />;
}

export function DialogPanel(props: HTMLMotionProps<"div">) {
  return <motion.div {...panelMotion} {...props} />;
}
