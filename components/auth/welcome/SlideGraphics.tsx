"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useStagger } from "@/components/auth/motion";
import { cn, RTL_FLIP } from "@/lib/utils";
import {
  ArrowRight,
  Building2,
  Calendar,
  Check,
  ChevronRight,
  ClipboardList,
  FileText,
  Home,
  MapPin,
  MessageSquare,
  User,
  Users,
} from "lucide-react";

/**
 * Decorative app-preview mockups for the pre-login carousel — close recreations
 * of the mobile onboarding slides, built from brand tokens + two copied photos.
 * Each card animates in with a subtle staggered rise (disabled under
 * prefers-reduced-motion). Purely illustrative, so each composition is aria-hidden.
 *
 * Copy is localized (welcomeCarousel.mockup.*) and layout uses logical inset /
 * border-radius utilities so the whole scene mirrors under dir="rtl".
 */

/** Slide 1 — community (event + Circles + group cards). */
export function CommunityGraphic() {
  const { container, item } = useStagger();
  const { t } = useTranslation();
  return (
    <motion.div
      {...container}
      className="relative mx-auto h-[340px] w-[300px]"
      aria-hidden
    >
      {/* Circles card */}
      <motion.div
        {...item}
        className="absolute top-0 end-0 z-10 w-[180px] overflow-hidden rounded-2xl bg-primary p-3 text-white shadow-md"
      >
        <div className="absolute -top-5 -end-3 h-16 w-16 rounded-full bg-white/15" />
        <div className="absolute top-8 end-6 h-10 w-10 rounded-full bg-white/10" />
        <div className="relative">
          <div className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-white/20">
            <Users className="h-3.5 w-3.5" />
          </div>
          <p className="text-sm font-bold">
            {t("welcomeCarousel.mockup.circlesTitle")}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-white/90">
            {t("welcomeCarousel.mockup.circlesBody")}
          </p>
          <div className="mt-2 flex items-center justify-center gap-1 rounded-full border border-white/40 bg-white/25 py-1.5 text-[11px] font-semibold">
            {t("welcomeCarousel.mockup.circlesCta")}{" "}
            <ArrowRight className={cn("h-3 w-3", RTL_FLIP)} />
          </div>
        </div>
      </motion.div>

      {/* Event card — title sits below the Circles card's bottom edge (no clip) */}
      <motion.div
        {...item}
        className="absolute top-[118px] start-0 w-[200px] overflow-hidden rounded-2xl border border-border-card bg-surface shadow-sm"
      >
        <div className="relative h-16 w-full">
          <Image
            src="/onboarding/event-card-header.png"
            alt=""
            fill
            sizes="200px"
            className="object-cover"
          />
          <div className="absolute top-2 start-2 flex flex-col items-center rounded-xl bg-onb-date-chip px-2 py-1 leading-none">
            <span className="text-sm font-bold text-ink">15</span>
            <span className="text-[10px] text-ink-muted">
              {t("welcomeCarousel.mockup.eventMonth")}
            </span>
          </div>
        </div>
        <div className="px-3 py-2">
          <p className="text-[13px] font-semibold text-ink">
            {t("welcomeCarousel.mockup.eventTitle")}
          </p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-placeholder">
            <Calendar className="h-3 w-3" />{" "}
            {t("welcomeCarousel.mockup.eventTime")}
          </p>
          <p className="flex items-center gap-1 text-[11px] text-ink-placeholder">
            <MapPin className="h-3 w-3" />{" "}
            {t("welcomeCarousel.mockup.eventLocation")}
          </p>
        </div>
      </motion.div>

      {/* Group card */}
      <motion.div
        {...item}
        className="absolute end-0 bottom-0 z-20 w-[180px] rounded-2xl border border-border-card bg-surface p-2 shadow-md"
      >
        <div className="relative h-[70px] w-full overflow-hidden rounded-xl">
          <Image
            src="/onboarding/group-card-photo.png"
            alt=""
            fill
            sizes="180px"
            className="object-cover"
          />
        </div>
        <p className="mt-2 px-1 text-xs font-semibold text-ink">
          {t("welcomeCarousel.mockup.groupName")}
        </p>
        <p className="px-1 text-[11px] text-ink-placeholder">
          {t("welcomeCarousel.mockup.groupMembers", { n: 286 })}
        </p>
      </motion.div>
    </motion.div>
  );
}

/** Slide 2 — checklist (Do Now timeline + SIN detail card). */
export function ChecklistGraphic() {
  const { container, item } = useStagger();
  const { t } = useTranslation();
  const tasks = [
    { label: t("welcomeCarousel.mockup.taskSin"), done: true },
    { label: t("welcomeCarousel.mockup.taskBank"), done: false },
    { label: t("welcomeCarousel.mockup.taskPhone"), done: false },
    { label: t("welcomeCarousel.mockup.taskHealth"), done: false },
  ];
  return (
    <motion.div
      {...container}
      className="relative mx-auto h-[340px] w-[300px]"
      aria-hidden
    >
      {/* Checklist card */}
      <motion.div
        {...item}
        className="absolute top-0 start-0 w-[250px] rounded-2xl border border-border-card bg-surface p-3 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-priority-do-now-bg">
            <span className="text-base font-bold text-priority-do-now">!</span>
          </div>
          <div>
            <p className="text-sm font-bold text-ink">
              {t("welcomeCarousel.mockup.doNowTitle")}
            </p>
            <p className="text-[11px] text-ink-muted">
              {t("welcomeCarousel.mockup.progressComplete", { done: 0, total: 4 })}
            </p>
          </div>
        </div>

        <div className="relative mt-3">
          <div className="absolute top-[14px] bottom-[14px] start-[13px] w-[1.5px] bg-onb-rail" />
          <div className="space-y-2">
            {tasks.map((task) => (
              <div key={task.label} className="relative z-10 flex items-start gap-2.5">
                <span
                  className={
                    task.done
                      ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-priority-do-now text-white"
                      : "flex h-7 w-7 shrink-0 rounded-full border-2 border-priority-do-now bg-surface"
                  }
                >
                  {task.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                <div className="flex-1 rounded-xl border border-border-card bg-surface px-2.5 py-1.5">
                  <p className="text-[11px] font-semibold text-ink-secondary">
                    {task.label}
                  </p>
                  <p className="text-[9px] text-ink-placeholder">
                    {t("welcomeCarousel.mockup.taskSubtitle")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* SIN detail card */}
      <motion.div
        {...item}
        className="absolute end-0 bottom-4 z-20 w-[186px] rounded-2xl border border-onb-card-border bg-surface p-3 shadow-lg"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-priority-do-now-bg">
          <ClipboardList className="h-4 w-4 text-priority-do-now" />
        </div>
        <p className="mt-1.5 text-sm font-bold text-ink">
          {t("welcomeCarousel.mockup.sinDetailTitle")}
        </p>
        <p className="mt-1 text-[10px] leading-snug text-ink-muted">
          {t("welcomeCarousel.mockup.sinDetailBody")}
        </p>
        <div className="mt-2 flex items-center justify-center gap-1 rounded-lg bg-priority-do-now py-1.5 text-[10px] font-semibold text-white">
          {t("welcomeCarousel.mockup.learnHow")}{" "}
          <ArrowRight className={cn("h-3 w-3", RTL_FLIP)} />
        </div>
        <div className="mt-1.5 flex items-center justify-center gap-1 rounded-lg bg-onb-success-bg py-1.5 text-[10px] font-semibold text-onb-success-text">
          {t("welcomeCarousel.mockup.markComplete")}{" "}
          <Check className="h-3 w-3" strokeWidth={3} />
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Slide 3 — companion (chat bubble + AI answer + action cards). */
export function CompanionGraphic() {
  const { container, item } = useStagger();
  const { t } = useTranslation();
  return (
    <motion.div
      {...container}
      className="relative mx-auto h-[340px] w-[300px]"
      aria-hidden
    >
      <motion.div
        {...item}
        className="absolute top-0 end-0 max-w-[210px] rounded-2xl rounded-se-sm bg-onb-chat-bubble px-3 py-2 text-[11px] leading-snug text-white shadow-sm"
      >
        {t("welcomeCarousel.mockup.chatQuestion")}
      </motion.div>

      <motion.div
        {...item}
        className="absolute top-[92px] start-0 w-[232px] rounded-2xl border border-border-card bg-surface p-3 shadow-sm"
      >
        <p className="text-xs font-bold text-ink">
          {t("welcomeCarousel.mockup.atAGlance")}
        </p>
        <p className="mt-1 text-[10px] leading-snug text-ink-muted">
          {t("welcomeCarousel.mockup.transitSummary")}
        </p>
        <p className="mt-2 text-xs font-bold text-ink">
          {t("welcomeCarousel.mockup.whatToKnow")}
        </p>
        <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-ink-muted">
          <span className="font-semibold text-ink-secondary">
            {t("welcomeCarousel.mockup.translinkLabel")}
          </span>{" "}
          {t("welcomeCarousel.mockup.translinkDesc")}
        </p>
      </motion.div>

      <motion.div
        {...item}
        className="absolute bottom-0 start-0 flex w-full gap-2"
      >
        <div className="flex-1 rounded-2xl border border-border-card bg-surface p-2.5">
          <div className="flex items-center gap-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-onb-ask-bg">
              <MessageSquare className="h-3.5 w-3.5 text-onb-ask-icon" />
            </div>
            <p className="text-[11px] font-semibold text-ink">
              {t("welcomeCarousel.mockup.askAnything")}
            </p>
            <ChevronRight
              className={cn("ms-auto h-3.5 w-3.5 text-ink-placeholder", RTL_FLIP)}
            />
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-ink-placeholder">
            {t("welcomeCarousel.mockup.askAnythingDesc")}
          </p>
        </div>
        <div className="flex-1 rounded-2xl border border-border-card bg-surface p-2.5">
          <div className="flex items-center gap-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-onb-form-bg">
              <FileText className="h-3.5 w-3.5 text-white" />
            </div>
            <p className="text-[11px] font-semibold text-ink">
              {t("welcomeCarousel.mockup.formHelp")}
            </p>
            <ChevronRight
              className={cn("ms-auto h-3.5 w-3.5 text-ink-placeholder", RTL_FLIP)}
            />
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-ink-placeholder">
            {t("welcomeCarousel.mockup.formHelpDesc")}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Slide 4 — learn. Coloured category cards positioned exactly as the mobile
 * LearnScreen (Figma 393×374 frame, as percentages so it scales). It's a loose
 * diagonal scatter — Documentation is largest and bleeds ~9% off the end edge.
 * Positions use logical `insetInlineStart` so the scatter mirrors under RTL.
 */
export function LearnGraphic() {
  const { container, item } = useStagger();
  const { t } = useTranslation();
  const cards = [
    {
      label: t("welcomeCarousel.mockup.catFinance"),
      sections: t("welcomeCarousel.mockup.sections", { n: 8 }),
      bg: "bg-onb-learn-finance",
      Icon: Building2,
      radius: "rounded-[16px]",
      box: { insetInlineStart: "0%", top: "0%", width: "43.8%", height: "31.6%" },
    },
    {
      label: t("welcomeCarousel.mockup.catEmployment"),
      sections: t("welcomeCarousel.mockup.sections", { n: 5 }),
      bg: "bg-onb-learn-employment",
      Icon: User,
      radius: "rounded-[16px]",
      box: { insetInlineStart: "52.2%", top: "18.2%", width: "43.0%", height: "31.0%" },
    },
    {
      label: t("welcomeCarousel.mockup.catHousing"),
      sections: t("welcomeCarousel.mockup.sections", { n: 3 }),
      bg: "bg-onb-learn-housing",
      Icon: Home,
      radius: "rounded-[14px]",
      box: { insetInlineStart: "4.6%", top: "52.1%", width: "37.9%", height: "27.3%" },
    },
    {
      label: t("welcomeCarousel.mockup.catDocumentation"),
      sections: t("welcomeCarousel.mockup.sections", { n: 5 }),
      bg: "bg-onb-learn-docs",
      Icon: FileText,
      radius: "rounded-[18px]",
      box: { insetInlineStart: "57.3%", top: "62.8%", width: "51.7%", height: "37.2%" },
    },
  ];
  return (
    <motion.div
      {...container}
      className="relative mx-auto aspect-[393/374] w-full max-w-[300px]"
      aria-hidden
    >
      {cards.map(({ label, sections, bg, Icon, radius, box }) => (
        <motion.div
          key={label}
          {...item}
          className={`absolute overflow-hidden shadow-md ${radius} ${bg}`}
          style={box}
        >
          <div className="absolute -top-6 -start-6 h-20 w-20 rounded-full bg-white/12" />
          <Icon className="absolute top-3 end-3 h-5 w-5 text-white/85" />
          <div className="absolute bottom-3 start-3 text-white">
            <p className="text-sm leading-tight font-bold">{label}</p>
            <p className="text-[11px] text-white/90">{sections}</p>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
