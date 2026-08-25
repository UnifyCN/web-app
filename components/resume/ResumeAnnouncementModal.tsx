"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { ModalShell } from "@/components/ui/ModalShell";
import { cn, RTL_FLIP } from "@/lib/utils";
import { useCreateResumeDraft, useResumeDrafts } from "@/hooks/useResume";

/**
 * First-visit announcement for the AI Resume Builder (Savar's big-feature launch
 * pattern). Self-contained: on first mount it checks a localStorage flag and, if
 * unseen, opens once; a "Take me to it" CTA navigates to /resume. Any dismissal
 * (CTA, close, Escape, backdrop) sets the flag so it never reshows.
 *
 * Show-once is a localStorage flag (per the HelpFab pattern) — no shared-DB write
 * is allowed here, so this is per-browser rather than per-account.
 */
const SEEN_KEY = "unify.resumeAnnouncementSeen";

/** Animated résumé + chat illustration — on-brand, static under reduced motion. */
function AnnouncementGraphic() {
  const reduce = useReducedMotion();
  // Content "lines" drawn in from the left, staggered, to evoke the resume
  // building itself as you chat.
  const line = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { scaleX: 0 },
          animate: { scaleX: 1 },
          transition: { delay, duration: 0.45, ease: "easeOut" as const },
        };
  const lineStyle = { transformBox: "fill-box" as const, transformOrigin: "left" };

  return (
    <div className="mb-4 flex justify-center">
      <svg
        viewBox="0 0 300 172"
        className="h-40 w-full max-w-[280px]"
        role="img"
        aria-hidden
      >
        {/* Document */}
        <rect
          x="74"
          y="12"
          width="164"
          height="150"
          rx="9"
          className="fill-surface stroke-border-card"
          strokeWidth="1.5"
        />
        {/* Name + contact (centered) */}
        <rect x="118" y="28" width="76" height="7" rx="3.5" className="fill-ink-secondary" />
        <rect x="128" y="41" width="56" height="3.5" rx="1.75" className="fill-ink-placeholder" />

        {/* Section A */}
        <rect x="90" y="58" width="34" height="5" rx="1" className="fill-ink-tertiary" />
        <line x1="90" y1="68" x2="222" y2="68" className="stroke-border-card" strokeWidth="1" />
        <motion.rect {...line(0.15)} style={lineStyle} x="90" y="73" width="120" height="3.5" rx="1.75" className="fill-ink-placeholder" />
        <motion.rect {...line(0.28)} style={lineStyle} x="90" y="80" width="96" height="3.5" rx="1.75" className="fill-ink-placeholder" />

        {/* Section B */}
        <rect x="90" y="94" width="28" height="5" rx="1" className="fill-ink-tertiary" />
        <line x1="90" y1="104" x2="222" y2="104" className="stroke-border-card" strokeWidth="1" />
        <motion.rect {...line(0.42)} style={lineStyle} x="90" y="109" width="128" height="3.5" rx="1.75" className="fill-ink-placeholder" />
        <motion.rect {...line(0.55)} style={lineStyle} x="90" y="116" width="104" height="3.5" rx="1.75" className="fill-ink-placeholder" />

        {/* Section C */}
        <rect x="90" y="130" width="30" height="5" rx="1" className="fill-ink-tertiary" />
        <motion.rect {...line(0.68)} style={lineStyle} x="90" y="140" width="112" height="3.5" rx="1.75" className="fill-ink-placeholder" />

        {/* AI chat bubble (orange), overlapping the lower-inline-start corner */}
        <motion.g
          initial={reduce ? undefined : { scale: 0, opacity: 0 }}
          animate={reduce ? undefined : { scale: 1, opacity: 1 }}
          transition={{ delay: 0.8, type: "spring", stiffness: 260, damping: 16 }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        >
          <rect x="30" y="104" width="70" height="44" rx="14" className="fill-primary" />
          <path d="M52 146 L52 160 L66 148 Z" className="fill-primary" />
          <circle cx="50" cy="126" r="4" className="fill-surface" />
          <circle cx="65" cy="126" r="4" className="fill-surface" />
          <circle cx="80" cy="126" r="4" className="fill-surface" />
        </motion.g>
        {/* Sparkle accent */}
        <motion.g
          initial={reduce ? undefined : { scale: 0, opacity: 0 }}
          animate={reduce ? undefined : { scale: 1, opacity: 1 }}
          transition={{ delay: 1, duration: 0.3 }}
        >
          <path
            d="M224 34 l2.2 5.6 5.6 2.2 -5.6 2.2 -2.2 5.6 -2.2 -5.6 -5.6 -2.2 5.6 -2.2 Z"
            className="fill-primary-light"
          />
        </motion.g>
      </svg>
    </div>
  );
}

export function ResumeAnnouncementModal() {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const draftsQuery = useResumeDrafts();
  const createDraft = useCreateResumeDraft();

  // Post-mount localStorage read (hydration-safe: server + first client render
  // both render nothing, matching the HelpFab pattern).
  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe one-time client flag; runs once on mount
        setOpen(true);
      }
    } catch {
      // Storage blocked (private mode) — just don't show the announcement.
    }
  }, []);

  function markSeen() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore
    }
  }

  function dismiss() {
    markSeen();
    setOpen(false);
  }

  // Drop the user straight into an editor: reopen their most recent resume, or
  // create a fresh one (the common first-visit case). If the list hasn't loaded
  // yet, fall back to /resume so we never spawn a spurious empty draft.
  async function goToResume() {
    markSeen();
    setOpen(false);
    const drafts = draftsQuery.data;
    if (drafts === undefined) {
      router.push("/resume");
      return;
    }
    if (drafts.length > 0) {
      router.push(`/resume/${drafts[0].id}`);
      return;
    }
    try {
      const created = await createDraft.mutateAsync();
      router.push(`/resume/${created.id}`);
    } catch (err) {
      console.error("Resume: announcement CTA failed", err);
      router.push("/resume");
    }
  }

  return (
    <ModalShell open={open} title={t("resume.announcement.title")} onClose={dismiss}>
      <AnnouncementGraphic />
      <p className="text-sm leading-relaxed text-ink-muted">
        {t("resume.announcement.body")}
      </p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={dismiss}
          className="cursor-pointer rounded-full px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-gray"
        >
          {t("resume.announcement.dismiss")}
        </button>
        <button
          type="button"
          onClick={goToResume}
          className="flex cursor-pointer items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {t("resume.announcement.cta")}
          <ArrowRight className={cn("h-4 w-4", RTL_FLIP)} aria-hidden />
        </button>
      </div>
    </ModalShell>
  );
}
