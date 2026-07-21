"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Sparkles, Users, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { trackHelpPathSelected } from "@/lib/analytics";
import { useIsRtl } from "@/hooks/useDirection";
import { cn, RTL_FLIP } from "@/lib/utils";
import { HelpChooser } from "./HelpChooser";
import { InLessonChat } from "./InLessonChat";
import { DiscussionBoard } from "./DiscussionBoard";
import type { LessonContext } from "@/types";

// useLayoutEffect on the client so the drag listeners attach synchronously (before
// the browser can deliver a pointerup); useEffect on the server to avoid the SSR
// "useLayoutEffect does nothing on the server" warning.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

type HelpView = "chooser" | "ai" | "discussion";

// Resizable-width drawer (desktop only). Width is applied via a `--drawer-w`
// CSS var that is consumed only at the `sm:` breakpoint, so mobile stays
// full-width and the resize handle is hidden there.
const DEFAULT_DRAWER_WIDTH = 420;
const MIN_DRAWER_WIDTH = 320;
const MAX_DRAWER_WIDTH = 800;
const DRAWER_WIDTH_STORAGE_KEY = "unify.helpDrawerWidth";
const DRAWER_WIDTH_STEP = 24;

/** The reachable maximum width: the static cap, but never more than 60% of the
 *  viewport. `window`-free on the server → falls back to the static cap. */
function effectiveMaxDrawerWidth(): number {
  return typeof window !== "undefined"
    ? Math.min(MAX_DRAWER_WIDTH, window.innerWidth * 0.6)
    : MAX_DRAWER_WIDTH;
}

/** Clamp a candidate width to [MIN, effective max]. */
function clampDrawerWidth(px: number): number {
  return Math.max(MIN_DRAWER_WIDTH, Math.min(px, effectiveMaxDrawerWidth()));
}

function readStoredDrawerWidth(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAWER_WIDTH_STORAGE_KEY);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function persistDrawerWidth(px: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      DRAWER_WIDTH_STORAGE_KEY,
      String(Math.round(px)),
    );
  } catch {
    // private mode / storage disabled — non-fatal
  }
}

/**
 * In-Lesson Help drawer (PRD R2) — an inline-end slide-in panel over the lesson
 * reader (right in LTR, left in RTL) hosting the chooser and both help paths.
 * Stays mounted while hidden
 * so the AI conversation and board filters survive close/reopen within a
 * lesson; closing never navigates, so the reader position is untouched.
 * Back arrows return to the chooser; Esc/backdrop close the drawer.
 */
export function HelpDrawer({
  open,
  lessonContext,
  onClose,
}: {
  open: boolean;
  lessonContext: LessonContext;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const isRtl = useIsRtl();
  const [view, setView] = useState<HelpView>("chooser");
  // Owned here (not in InLessonChat) so revisiting the AI path continues the
  // same conversation instead of spawning a new row per visit.
  const [aiConversationId, setAiConversationId] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Stable id so the resize handle (role="separator") can point aria-controls at
  // the panel it resizes (WAI-ARIA window-splitter pattern).
  const panelId = useId();
  // Only mount path content after first open — the drawer sits in every
  // lesson page, and the board/stats queries shouldn't fire until asked for.
  // Previous-prop pattern (see ReportModal) so we never setState in an effect.
  const [everOpened, setEverOpened] = useState(open);
  if (open && !everOpened) setEverOpened(true);

  // Drawer width (desktop). `widthRef` mirrors it so a drag can write the width
  // straight to the DOM without a re-render (keeps the heavy chat/board children
  // from re-rendering ~60x/s mid-drag); React state is synced on pointer-up.
  const [width, setWidth] = useState(DEFAULT_DRAWER_WIDTH);
  const widthRef = useRef(DEFAULT_DRAWER_WIDTH);
  const [dragging, setDragging] = useState(false);
  // Viewport-capped max (min of MAX and 60vw), exposed via aria-valuemax. Held in
  // state — a render-time window read would break hydration — seeded at the static
  // max (matches SSR) and corrected post-mount + on resize.
  const [effectiveMax, setEffectiveMax] = useState(MAX_DRAWER_WIDTH);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      // Trap Tab / Shift+Tab within the drawer so focus can't escape to the
      // lesson underneath while the modal is open.
      if (event.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Hydrate the persisted width post-mount (a lazy useState initializer would
  // read localStorage during SSR/first render and cause a hydration mismatch).
  useEffect(() => {
    const stored = readStoredDrawerWidth();
    if (stored == null) return;
    const clamped = clampDrawerWidth(stored);
    widthRef.current = clamped;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe persisted width; runs once on mount
    setWidth(clamped);
  }, []);

  // Track the viewport-capped max (for aria-valuemax) and re-clamp the width when
  // the viewport shrinks so the drawer can't exceed 60% of it.
  useEffect(() => {
    function onResize() {
      setEffectiveMax(effectiveMaxDrawerWidth());
      const clamped = clampDrawerWidth(widthRef.current);
      widthRef.current = clamped;
      setWidth(clamped);
    }
    // Correct the static-max SSR seed with the real viewport max post-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe post-mount viewport read
    setEffectiveMax(effectiveMaxDrawerWidth());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // While a drag is active, listen on `window` (not the handle) so move/up are
  // caught even if the pointer leaves the handle, then tear the listeners down on
  // release. Handlers are declared inside the effect, so add/remove identities
  // always match — no leaked or stacked listeners (the previous handle-bound +
  // setPointerCapture version could miss pointerup and resize on hover forever).
  // A layout effect attaches them synchronously right after the `dragging` commit,
  // before the browser can deliver a pointerup (closes the fast press/release
  // race). Width is written straight to the DOM per move, so the heavy chat/board
  // children never re-render mid-drag; React state syncs once on release.
  useIsomorphicLayoutEffect(() => {
    if (!dragging) return;
    function onMove(event: PointerEvent) {
      // The panel is anchored to the inline-end edge and the handle sits on its
      // inline-start edge, so width = distance from the pointer to that anchored
      // edge: the right edge in LTR (`innerWidth - clientX`), the left edge (i.e.
      // `clientX`) in RTL.
      const clamped = clampDrawerWidth(
        isRtl ? event.clientX : window.innerWidth - event.clientX,
      );
      widthRef.current = clamped;
      panelRef.current?.style.setProperty("--drawer-w", `${clamped}px`);
    }
    function onUp() {
      setWidth(widthRef.current); // sync React state to the final dragged width
      setDragging(false);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      persistDrawerWidth(widthRef.current);
    };
  }, [dragging, isRtl]);

  // While dragging, React `width` is intentionally stale — onMove writes the DOM
  // directly to avoid re-rendering the chat/board children every frame. If an
  // unrelated state change (e.g. a window-resize `setWidth`) re-renders mid-drag,
  // the panel's `style` prop would reset `--drawer-w` to that stale value, so
  // re-assert the live width from the ref after every commit while dragging.
  // (Refs must be read in effects, not render, so the style prop can't read it.)
  useIsomorphicLayoutEffect(() => {
    if (!dragging) return;
    panelRef.current?.style.setProperty("--drawer-w", `${widthRef.current}px`);
  });

  function onHandlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(true);
  }

  function onHandleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    // The drawer grows toward the inline-start edge: leftward in LTR (Left =
    // wider), rightward in RTL (Right = wider). Keep the DOM key names fixed and
    // pick which one widens by direction (mirrors ImageLightbox's arrow swap).
    const widerKey = isRtl ? "ArrowRight" : "ArrowLeft";
    const narrowerKey = isRtl ? "ArrowLeft" : "ArrowRight";
    let next: number | null = null;
    if (event.key === widerKey) next = widthRef.current + DRAWER_WIDTH_STEP;
    else if (event.key === narrowerKey)
      next = widthRef.current - DRAWER_WIDTH_STEP;
    else if (event.key === "Home") next = MIN_DRAWER_WIDTH;
    else if (event.key === "End") next = effectiveMaxDrawerWidth();
    if (next == null) return;
    event.preventDefault();
    const clamped = clampDrawerWidth(next);
    widthRef.current = clamped;
    setWidth(clamped);
    persistDrawerWidth(clamped);
  }

  function selectPath(path: "ai" | "community") {
    trackHelpPathSelected({
      path,
      moduleId: lessonContext.moduleId,
      lessonId: lessonContext.lessonId,
    });
    setView(path === "ai" ? "ai" : "discussion");
  }

  const header: Record<
    HelpView,
    { title: string; subtitle?: string; icon?: React.ReactNode }
  > = {
    chooser: { title: t("learnWeb.help.chooserTitle") },
    ai: {
      title: t("learnWeb.help.aiTitle"),
      subtitle: t("learnWeb.help.aiSubtitle"),
      icon: (
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
      ),
    },
    discussion: {
      title: t("learnWeb.help.communityTitle"),
      subtitle: lessonContext.moduleTitle,
      icon: (
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 text-white">
          <Users className="h-4 w-4" aria-hidden />
        </span>
      ),
    },
  };

  return (
    <div
      aria-hidden={!open}
      className={cn("fixed inset-0 z-50", !open && "pointer-events-none")}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden
        className={cn(
          "absolute inset-0 bg-black/30 transition-opacity duration-200 motion-reduce:transition-none",
          open ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-modal="true"
        aria-label={t("learnWeb.help.chooserTitle")}
        style={{ "--drawer-w": `${width}px` } as React.CSSProperties}
        className={cn(
          "absolute inset-y-0 end-0 flex w-full flex-col bg-surface shadow-xl sm:w-[var(--drawer-w)] sm:max-w-[92vw] sm:border-s sm:border-border-card",
          "transition-transform duration-200 motion-reduce:transition-none",
          open ? "translate-x-0" : "translate-x-full rtl:-translate-x-full",
        )}
      >
        {/* Resize handle — desktop only; drag the inner (inline-start) edge to set the width */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("learnWeb.help.resizeAria")}
          aria-controls={panelId}
          aria-valuenow={Math.round(width)}
          aria-valuemin={MIN_DRAWER_WIDTH}
          aria-valuemax={Math.round(effectiveMax)}
          tabIndex={0}
          onPointerDown={onHandlePointerDown}
          onKeyDown={onHandleKeyDown}
          className={cn(
            "group absolute inset-y-0 start-0 z-10 hidden w-1.5 cursor-col-resize touch-none items-center justify-center hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:flex",
            dragging && "bg-primary/10",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "h-8 w-1 rounded-full bg-border-card transition-colors group-hover:bg-primary",
              dragging && "bg-primary",
            )}
          />
        </div>

        {/* Header */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border-card px-4">
          {view !== "chooser" && (
            <button
              type="button"
              onClick={() => setView("chooser")}
              aria-label={t("learnWeb.help.backToOptionsAria")}
              className="-ms-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ArrowLeft className={cn("h-5 w-5", RTL_FLIP)} aria-hidden />
            </button>
          )}
          {header[view].icon}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold text-ink-secondary">
              {header[view].title}
            </h2>
            {header[view].subtitle && (
              <p className="truncate text-xs text-ink-placeholder">
                {header[view].subtitle}
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("learnWeb.help.closeAria")}
            className="-me-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        {/* Body */}
        {everOpened && (
          <>
            {view === "chooser" && (
              <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
                <HelpChooser
                  lessonContext={lessonContext}
                  onSelect={selectPath}
                />
              </div>
            )}
            {view === "ai" && (
              <InLessonChat
                lessonContext={lessonContext}
                conversationId={aiConversationId}
                onConversationCreated={setAiConversationId}
              />
            )}
            {view === "discussion" && (
              <DiscussionBoard lessonContext={lessonContext} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
