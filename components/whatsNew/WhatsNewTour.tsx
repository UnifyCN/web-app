"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useIsRtl } from "@/hooks/useDirection";
import {
  trackWhatsNewCompleted,
  trackWhatsNewDismissed,
  trackWhatsNewShown,
  trackWhatsNewStep,
} from "@/lib/analytics";
import { cn } from "@/lib/utils";
import {
  WHATS_NEW_STEPS,
  closeWhatsNew,
  findStepTarget,
  hasSeenWhatsNew,
  markWhatsNewSeen,
  openWhatsNew,
  placeTooltip,
  whatsNewOpenStore,
  type Box,
  type Side,
  type WhatsNewStep,
} from "@/lib/whatsNew";

/** Space around the target inside the spotlight cutout. */
const PAD = 6;
/** Gap between cutout and tooltip; the arrow sits in it. */
const GAP = 44;
/** Minimum distance from the viewport edges. */
const EDGE = 12;
const TIP_WIDTH = 300;
const ARROW = 24;

const FOCUSABLE =
  'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** Arrow icon pointing from the tooltip toward the target. */
const ARROWS: Record<Side, typeof ArrowLeft> = {
  right: ArrowLeft, // tooltip to the right → point left
  left: ArrowRight,
  bottom: ArrowUp,
  top: ArrowDown,
};

/** Arrow bounce: a slow ease toward the target and back, forever. */
const BOUNCE = {
  opacity: { duration: 0.2 },
  x: { duration: 1.1, repeat: Infinity, ease: "easeInOut" as const },
  y: { duration: 1.1, repeat: Infinity, ease: "easeInOut" as const },
};

/** True while another modal dialog (e.g. the resume announcement) is open. */
function otherDialogOpen(): boolean {
  return (
    document.querySelector(
      '[role="dialog"][aria-modal="true"]:not([data-whats-new-tour])',
    ) !== null
  );
}

function visibleSteps(): WhatsNewStep[] {
  return WHATS_NEW_STEPS.filter((step) => findStepTarget(step) !== null);
}

function toBox(el: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  return {
    left: r.left - PAD,
    top: r.top - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

/**
 * One-time "What's new" spotlight tour, mounted once in the (main) layout.
 * Dims the page, cuts a spotlight around the real nav item for each step,
 * points at it with a gently bouncing arrow, and explains it in a tooltip card
 * (title, one line, step dots, Back / Next, Skip; "Done" on the last step).
 *
 * Steps whose target isn't on screen are skipped, so phones (bottom nav, no
 * Job tools item) get Resources + Language only. Auto-opens once per user
 * (localStorage, keyed by user id), after any other open dialog closes; the
 * Settings "What's new" row replays it. Escape skips, arrow keys step (mirrored
 * in RTL), Tab stays inside the card. Under prefers-reduced-motion the
 * spotlight jumps instead of gliding and nothing bounces.
 */
export function WhatsNewTour() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const rtl = useIsRtl();
  const titleId = useId();
  const bodyId = useId();
  const maskId = useId();
  const { data: user } = useAuthUser();
  const userId = user?.id;
  const trigger = useSyncExternalStore(
    whatsNewOpenStore.subscribe,
    whatsNewOpenStore.get,
    () => null,
  );
  const open = trigger !== null;

  const [steps, setSteps] = useState<WhatsNewStep[]>([]);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [tipHeight, setTipHeight] = useState(180);
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  const step = steps[index];
  const isLast = index === steps.length - 1;

  // Auto-open once per user. Marked seen the moment it shows, so a reload or
  // a second tab never re-shows it.
  useEffect(() => {
    if (!userId || hasSeenWhatsNew(userId)) return;
    const show = () => {
      if (hasSeenWhatsNew(userId)) return true;
      if (otherDialogOpen() || visibleSteps().length === 0) return false;
      markWhatsNewSeen(userId);
      openWhatsNew("auto");
      return true;
    };
    if (show()) return;
    // Another dialog is up (or the nav hasn't rendered): wait for the DOM.
    const observer = new MutationObserver(() => {
      if (show()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [userId]);

  // Opening: pick the steps that have a target on this screen, start at 1.
  // The effect syncs from an external store (the open request), so setting
  // state here is the subscription callback, not a derived-state render.
  const lastTrigger = useRef<typeof trigger>(null);
  useEffect(() => {
    if (trigger && lastTrigger.current !== trigger) {
      const available = visibleSteps();
      if (available.length === 0) {
        closeWhatsNew();
      } else {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on each external open request
        setSteps(available);
        setIndex(0);
        trackWhatsNewShown({ trigger });
      }
    }
    lastTrigger.current = trigger;
  }, [trigger]);

  // `whats_new_step` each time a step comes on screen.
  useEffect(() => {
    if (open && step) trackWhatsNewStep({ step: index + 1 });
  }, [open, step, index]);

  // Measure the target (and keep measuring on resize / scroll / layout
  // shifts). If the breakpoint changes mid-tour and the target disappears,
  // rebuild the step list and stay on the same step where possible.
  const measure = useCallback(() => {
    if (!step) return;
    setViewport({ width: window.innerWidth, height: window.innerHeight });
    const el = findStepTarget(step);
    if (el) {
      setBox(toBox(el));
      return;
    }
    const available = visibleSteps();
    if (available.length === 0) {
      closeWhatsNew();
      return;
    }
    const keep = available.findIndex((s) => s.id === step.id);
    setSteps(available);
    setIndex(keep >= 0 ? keep : Math.min(index, available.length - 1));
  }, [step, index]);

  useLayoutEffect(() => {
    if (!open || !step) return;
    const el = findStepTarget(step);
    if (el) {
      const r = el.getBoundingClientRect();
      const offscreen =
        r.top < 0 ||
        r.left < 0 ||
        r.bottom > window.innerHeight ||
        r.right > window.innerWidth;
      if (offscreen) {
        el.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: reduce ? "auto" : "smooth",
        });
      }
    }
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    if (el) ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      ro.disconnect();
    };
  }, [open, step, measure, reduce]);

  // Track the card's real height so placement flips/clamps correctly.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!open || !card) return;
    const ro = new ResizeObserver(() => setTipHeight(card.offsetHeight));
    ro.observe(card);
    setTipHeight(card.offsetHeight);
    return () => ro.disconnect();
  }, [open, step]);


  const finish = useCallback(
    (completed: boolean) => {
      if (userId) markWhatsNewSeen(userId);
      if (completed) trackWhatsNewCompleted();
      else trackWhatsNewDismissed({ atStep: index + 1 });
      closeWhatsNew();
    },
    [userId, index],
  );

  const next = useCallback(() => {
    if (isLast) finish(true);
    else setIndex((i) => i + 1);
  }, [isLast, finish]);

  const back = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  // Keys: Escape skips, arrows step (mirrored in RTL), Tab stays in the card.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
        return;
      }
      const forward = rtl ? "ArrowLeft" : "ArrowRight";
      const backward = rtl ? "ArrowRight" : "ArrowLeft";
      if (event.key === forward) {
        event.preventDefault();
        next();
        return;
      }
      if (event.key === backward) {
        event.preventDefault();
        back();
        return;
      }
      if (event.key !== "Tab") return;
      const card = cardRef.current;
      if (!card) return;
      const focusables = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !card.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !card.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, rtl, next, back, finish]);

  // Focus the primary action on every step, once the card is placed (it's
  // `invisible` until then, and hidden elements can't take focus).
  const placed = box !== null && viewport.width > 0;
  // Retries for a few frames: the card can still be computed `hidden` on the
  // frame it's placed (e.g. mid enter-animation), where focus() is a no-op.
  useEffect(() => {
    if (!open || !step || !placed) return;
    let frame = 0;
    let tries = 0;
    const tryFocus = () => {
      const button = primaryRef.current;
      if (!button) return;
      button.focus({ preventScroll: true });
      if (document.activeElement !== button && tries++ < 30) {
        frame = requestAnimationFrame(tryFocus);
      }
    };
    tryFocus();
    return () => cancelAnimationFrame(frame);
  }, [open, step, placed]);

  if (typeof document === "undefined") return null;

  const tipWidth = Math.min(TIP_WIDTH, Math.max(0, viewport.width - EDGE * 2));
  const placement =
    box && viewport.width
      ? placeTooltip(
          box,
          { width: tipWidth, height: tipHeight },
          viewport,
          rtl,
          GAP,
          EDGE,
        )
      : null;
  const Arrow = placement ? ARROWS[placement.side] : ArrowLeft;
  // Arrow centred in the gap, on the target's cross-axis centre.
  const arrowPos =
    box && placement
      ? placement.side === "right"
        ? { left: box.left + box.width + (GAP - ARROW) / 2, top: box.top + box.height / 2 - ARROW / 2 }
        : placement.side === "left"
          ? { left: box.left - GAP + (GAP - ARROW) / 2, top: box.top + box.height / 2 - ARROW / 2 }
          : placement.side === "bottom"
            ? { left: box.left + box.width / 2 - ARROW / 2, top: box.top + box.height + (GAP - ARROW) / 2 }
            : { left: box.left + box.width / 2 - ARROW / 2, top: box.top - GAP + (GAP - ARROW) / 2 }
      : null;
  // Bounce toward the target.
  const bounceAxis = placement?.side === "left" || placement?.side === "right" ? "x" : "y";
  const bounceSign = placement?.side === "right" || placement?.side === "bottom" ? -1 : 1;
  // Tooltip enters from slightly further away from the target.
  const enterOffset =
    placement?.side === "right"
      ? { x: 8 }
      : placement?.side === "left"
        ? { x: -8 }
        : placement?.side === "bottom"
          ? { y: 8 }
          : { y: -8 };
  const glide = reduce
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 320, damping: 34 };

  return createPortal(
    <AnimatePresence>
      {open && step && (
        <motion.div
          key="whats-new-tour"
          className="fixed inset-0 z-[70]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0.12 : 0.22, ease: "easeOut" }}
        >
          {/* Dim layer with the spotlight cut out; it also swallows clicks
              so the page underneath can't be used mid-tour. */}
          <svg className="absolute inset-0 h-full w-full" aria-hidden>
            <defs>
              <mask id={maskId}>
                <rect width="100%" height="100%" fill="white" />
                {box && (
                  <motion.rect
                    rx={12}
                    fill="black"
                    initial={false}
                    animate={{ x: box.left, y: box.top, width: box.width, height: box.height }}
                    transition={glide}
                  />
                )}
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="black"
              fillOpacity={0.55}
              mask={`url(#${maskId})`}
            />
            {box && (
              <motion.rect
                rx={12}
                fill="none"
                className="stroke-primary"
                strokeWidth={2}
                initial={false}
                animate={{ x: box.left, y: box.top, width: box.width, height: box.height }}
                transition={glide}
              />
            )}
          </svg>

          {arrowPos && (
            <motion.div
              key={`arrow-${step.id}-${placement?.side}`}
              className="pointer-events-none absolute text-primary drop-shadow"
              style={{ left: arrowPos.left, top: arrowPos.top }}
              initial={{ opacity: 0 }}
              animate={
                reduce
                  ? { opacity: 1 }
                  : { opacity: 1, [bounceAxis]: [0, 6 * bounceSign, 0] }
              }
              transition={reduce ? { duration: 0.15 } : BOUNCE}
              aria-hidden
            >
              <Arrow className="h-6 w-6" strokeWidth={2.5} />
            </motion.div>
          )}

          <motion.div
            key={`card-${step.id}`}
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={bodyId}
            data-whats-new-tour=""
            className={cn(
              "absolute rounded-card border border-border-card bg-surface p-4 shadow-xl",
              !placement && "invisible",
            )}
            style={{
              width: tipWidth,
              left: placement?.left ?? 0,
              top: placement?.top ?? 0,
            }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, ...enterOffset }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ duration: reduce ? 0.12 : 0.22, ease: "easeOut" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5" aria-hidden>
                  {steps.map((s, i) => (
                    <span
                      key={s.id}
                      className={cn(
                        "h-1.5 rounded-full transition-all duration-200",
                        i === index ? "w-4 bg-primary" : "w-1.5 bg-border",
                      )}
                    />
                  ))}
                </div>
                <span className="text-xs text-ink-placeholder">
                  {t("whatsNew.tour.stepOf", { current: index + 1, total: steps.length })}
                </span>
              </div>
              {!isLast && (
                <button
                  type="button"
                  onClick={() => finish(false)}
                  className="cursor-pointer rounded-full px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {t("whatsNew.tour.skip")}
                </button>
              )}
            </div>

            <h2 id={titleId} className="mt-3 text-base font-semibold text-ink-secondary">
              {t(`whatsNew.items.${step.key}.title`)}
            </h2>
            <p id={bodyId} className="mt-1 text-sm leading-relaxed text-ink-muted">
              {t(`whatsNew.items.${step.key}.body`)}
            </p>

            <div className="mt-4 flex items-center justify-end gap-2">
              {index > 0 && (
                <button
                  type="button"
                  onClick={back}
                  className="cursor-pointer rounded-full px-4 py-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {t("whatsNew.tour.back")}
                </button>
              )}
              <button
                ref={primaryRef}
                type="button"
                onClick={next}
                className="cursor-pointer rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                {isLast ? t("whatsNew.tour.done") : t("whatsNew.tour.next")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
