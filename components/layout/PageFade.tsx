"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { DURATION, EASE_CSS } from "@/lib/motion";

/**
 * Fades the page in when the user moves to another page inside the app.
 *
 * The first page load is never faded: the server HTML renders at full opacity
 * and this only runs when the pathname changes afterwards, so it costs nothing
 * on load. There is no exit animation, so navigation never waits, and it is a
 * fade only (no movement): the text people read stays still and it doesn't
 * stack with Safari's swipe-back. Opacity only also matters for layout: a
 * wrapper that keeps a `transform` would clip `fixed` overlays inside the page.
 * It runs on the browser's own `element.animate()`, off the main thread, and
 * leaves no inline style behind when it ends.
 */
export function PageFade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const shownPath = useRef(pathname);
  const reduce = useReducedMotion();

  useLayoutEffect(() => {
    if (shownPath.current === pathname) return;
    shownPath.current = pathname;
    const node = ref.current;
    if (!node || reduce) return;
    const fade = node.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: DURATION.base * 1000,
      easing: EASE_CSS.out,
    });
    return () => fade.cancel();
  }, [pathname, reduce]);

  return <div ref={ref}>{children}</div>;
}
