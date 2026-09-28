"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import {
  HIGHLIGHT_TARGETS,
  HIGHLIGHT_TIP_KEYS,
  clearHighlight,
  whatsNewHighlightStore,
  type WhatsNewItem,
} from "@/lib/whatsNew";

const TIP_WIDTH = 248;
const GAP = 10;
const EDGE = 12;

interface Found {
  el: HTMLElement;
  target: string;
  rect: DOMRect;
}

function findTarget(targets: readonly string[]): { el: HTMLElement; target: string } | null {
  for (const target of targets) {
    const el = document.querySelector<HTMLElement>(`[data-whats-new-target="${target}"]`);
    // Skip hidden copies (e.g. a desktop-only control at 375px).
    if (el && el.getClientRects().length > 0) return { el, target };
  }
  return null;
}

/**
 * The "Show me" highlight: after the What's new card navigates, this finds the
 * item's `data-whats-new-target` element and marks it with the same pulse ring
 * the In-Lesson Help button uses (HelpFab's `animate-ping`, hidden under reduced
 * motion) plus a small dismissible tooltip that eases in like a toast (opacity
 * only under reduced motion).
 *
 * Clears on the tooltip's X, Escape, a click on the target, or navigating away
 * from the item's section. Only ever shown after "Show me".
 */
export function WhatsNewHighlight() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const pathname = usePathname();
  const item = useSyncExternalStore(
    whatsNewHighlightStore.subscribe,
    whatsNewHighlightStore.get,
    () => null,
  );
  const [found, setFound] = useState<Found | null>(null);

  // Leaving the item's section drops the highlight — but only once it has been
  // reached: "Show me" requests the highlight before the navigation lands.
  const reached = useRef<WhatsNewItem | null>(null);
  useEffect(() => {
    if (!item) {
      reached.current = null;
      return;
    }
    if (pathname.startsWith(item.pathPrefix)) reached.current = item;
    else if (reached.current === item) clearHighlight();
  }, [item, pathname]);

  // Locate the target (it may render after data loads), then track its box on
  // scroll/resize. Re-runs on pathname so /resume → an editor swaps targets.
  useEffect(() => {
    if (!item) return;
    const targets = HIGHLIGHT_TARGETS[item.id];
    let current: { el: HTMLElement; target: string } | null = null;
    let scrolled = false;

    const measure = () => {
      const next = findTarget(targets);
      if (!next) {
        current = null;
        setFound(null);
        return;
      }
      if (!scrolled || next.el !== current?.el) {
        next.el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
        scrolled = true;
      }
      current = next;
      setFound({ ...next, rect: next.el.getBoundingClientRect() });
    };

    measure();
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [item, pathname, reduce]);

  // Clicking the highlighted control, or Escape, dismisses it.
  const el = item ? found?.el : undefined;
  useEffect(() => {
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearHighlight();
    };
    // The /resume "New resume" step keeps the highlight so it can move on to
    // "Target a job" in the editor; every other target is the final step.
    const final = el.dataset.whatsNewTarget !== "job-import-start";
    const onClick = () => {
      if (final) clearHighlight();
    };
    el.addEventListener("click", onClick);
    el.addEventListener("focus", onClick, true);
    el.addEventListener("change", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("click", onClick);
      el.removeEventListener("focus", onClick, true);
      el.removeEventListener("change", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [el]);

  if (typeof document === "undefined") return null;

  const show = item && found;
  // Vertical anchor: `top` below the target, `bottom` above it. Anchoring with
  // `bottom` (not a translateY(-100%) transform) leaves `transform` free for
  // Motion's animated `y`, which would otherwise override the offset.
  let tipTop: number | undefined;
  let tipBottom: number | undefined;
  let tipLeft = 0;
  let below = true;
  if (show) {
    const { rect } = found;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    below = rect.bottom + GAP + 96 < vh || rect.top < 120;
    if (below) tipTop = rect.bottom + GAP;
    else tipBottom = vh - (rect.top - GAP);
    const center = rect.left + rect.width / 2;
    tipLeft = Math.min(
      Math.max(center - TIP_WIDTH / 2, EDGE),
      Math.max(EDGE, vw - TIP_WIDTH - EDGE),
    );
  }
  const arrowLeft = show
    ? Math.min(
        Math.max(found.rect.left + found.rect.width / 2 - tipLeft - 6, 14),
        TIP_WIDTH - 26,
      )
    : 0;

  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div
          key={found.target}
          className="pointer-events-none fixed inset-0 z-[55]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.18, ease: "easeOut" }}
        >
          {/* Pulse ring over the target (HelpFab's discoverability pulse). */}
          <span
            aria-hidden
            className="absolute rounded-xl ring-2 ring-primary"
            style={{
              top: found.rect.top - 4,
              left: found.rect.left - 4,
              width: found.rect.width + 8,
              height: found.rect.height + 8,
            }}
          >
            <span className="absolute inset-0 animate-ping rounded-xl bg-primary/30 motion-reduce:hidden" />
          </span>

          <motion.div
            role="status"
            className="pointer-events-auto absolute rounded-card border border-border-card bg-surface p-3 pe-9 shadow-lg"
            style={{
              top: tipTop,
              bottom: tipBottom,
              left: tipLeft,
              width: TIP_WIDTH,
            }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: below ? 6 : -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.18, ease: "easeOut" }}
          >
            {/* Pointer toward the target. */}
            <span
              aria-hidden
              className="absolute h-3 w-3 rotate-45 border-border-card bg-surface"
              style={{
                left: arrowLeft,
                ...(below
                  ? { top: -6, borderTopWidth: 1, borderLeftWidth: 1 }
                  : { bottom: -6, borderBottomWidth: 1, borderRightWidth: 1 }),
              }}
            />
            <p className="text-xs leading-relaxed text-ink-secondary">
              {t(HIGHLIGHT_TIP_KEYS[found.target])}
            </p>
            <button
              type="button"
              onClick={clearHighlight}
              aria-label={t("common.close")}
              className="absolute end-1.5 top-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-ink-placeholder transition-colors hover:bg-surface-gray hover:text-ink"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
