"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, ChevronDown, HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn, RTL_FLIP } from "@/lib/utils";
import { Collapse } from "@/components/ui/Collapse";
import { LessonListRow } from "./LessonListRow";
import { lessonReadMinutes } from "@/lib/learn/readTime";
import type { LessonProgress, PracticeProgress, SanityLesson } from "@/types";

export type SubmoduleState = "completed" | "in_progress" | "not_started";

interface SubmoduleTimelineRowProps {
  moduleId: string;
  submoduleId: string;
  title: string;
  lessonCount: number;
  completedCount: number;
  state: SubmoduleState;
  isActiveCTA: boolean;
  colorHex: string;
  isFirst: boolean;
  isLast: boolean;
  /** Lessons revealed when the row is expanded. */
  lessons: SanityLesson[];
  progresses: Record<string, LessonProgress>;
  hasPractice: boolean;
  practiceProgress: PracticeProgress | null | undefined;
}

export function SubmoduleTimelineRow({
  moduleId,
  submoduleId,
  title,
  lessonCount,
  completedCount,
  state,
  isActiveCTA,
  colorHex,
  isFirst,
  isLast,
  lessons,
  progresses,
  hasPractice,
  practiceProgress,
}: SubmoduleTimelineRowProps) {
  const { t } = useTranslation();
  // Open the active (first-incomplete) section by default; otherwise collapsed.
  const [open, setOpen] = useState(isActiveCTA);
  const reduce = useReducedMotion();

  // When this row becomes the active section (e.g. progress shifts), open it —
  // but never auto-collapse a row the user opened themselves. Done during render
  // (React's "adjust state on prop change" pattern) since the project lints
  // against setState-in-effect.
  const [prevActive, setPrevActive] = useState(isActiveCTA);
  if (prevActive !== isActiveCTA) {
    setPrevActive(isActiveCTA);
    if (isActiveCTA) setOpen(true);
  }

  const dotFilled = state === "completed";
  const dotRingColor =
    state === "completed" || state === "in_progress"
      ? colorHex
      : "var(--color-border-card)";
  const lineColor = dotRingColor;
  const lineDashed = state !== "completed";

  const practiceCompleted = !!practiceProgress?.isCompleted;
  const practiceScore = practiceProgress?.score;
  const practiceTotal = practiceProgress?.totalQuestions;

  const lineStyle = { borderColor: lineColor, opacity: lineDashed ? 0.45 : 1 };

  return (
    <li className="relative flex items-stretch gap-4">
      {/* Timeline rail — fixed top stub aligns the dot with the card header,
          grow bottom keeps the connecting line continuous through expansion. */}
      <div className="relative flex w-6 flex-col items-center">
        <span
          aria-hidden
          className={cn(
            "h-7 w-0.5 border-s-2",
            isFirst && "invisible",
            lineDashed ? "border-dashed" : "border-solid",
          )}
          style={lineStyle}
        />
        <span
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
            dotFilled && "border-transparent",
          )}
          style={{
            borderColor: dotFilled ? "transparent" : dotRingColor,
            backgroundColor: dotFilled ? colorHex : "var(--color-surface)",
          }}
        >
          {dotFilled && (
            <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} aria-hidden />
          )}
        </span>
        <span
          aria-hidden
          className={cn(
            "w-0.5 grow border-s-2",
            isLast && "invisible",
            lineDashed ? "border-dashed" : "border-solid",
          )}
          style={lineStyle}
        />
      </div>

      {/* Content column: card + chevron header, then the expandable panel. */}
      <div className="min-w-0 flex-1">
        <div className="my-1.5 flex items-center gap-2">
          <Link
            href={`/learn/${moduleId}/${submoduleId}`}
            className={cn(
              "flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-card border p-4 transition-all duration-200",
              isActiveCTA
                ? "border-transparent text-white shadow-sm"
                : "border-border-card bg-surface hover:bg-surface-card",
            )}
            style={isActiveCTA ? { backgroundColor: colorHex } : undefined}
          >
            <div className="min-w-0 flex-1">
              <h3
                className={cn(
                  "truncate text-base font-bold",
                  isActiveCTA ? "text-white" : "text-ink-secondary",
                )}
              >
                {title}
              </h3>
              <p
                className={cn(
                  "mt-0.5 text-xs",
                  isActiveCTA ? "text-white/85" : "text-ink-muted",
                )}
              >
                {t("learnWeb.module.lessonProgress", {
                  completed: completedCount,
                  count: lessonCount,
                })}
              </p>
            </div>
            {isActiveCTA && (
              <span
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md bg-white px-3 text-xs font-semibold"
                style={{ color: colorHex }}
              >
                {t("common.continue")}
                <ArrowRight className={cn("h-3.5 w-3.5", RTL_FLIP)} aria-hidden />
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={
              open
                ? t("learnWeb.module.hideLessons")
                : t("learnWeb.module.showLessons")
            }
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border-card bg-surface text-ink-muted transition-all duration-200 hover:bg-surface-gray hover:text-ink active:scale-95"
          >
            <motion.span
              className="flex"
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: reduce ? 0 : 0.2 }}
            >
              <ChevronDown className="h-5 w-5" aria-hidden />
            </motion.span>
          </button>
        </div>

        <Collapse open={open}>
          <div className="mb-2 rounded-card border border-border-card bg-surface p-1.5">
            {lessons.map((lesson) => (
              <LessonListRow
                key={lesson._id}
                href={`/learn/${moduleId}/${submoduleId}/${lesson._id}`}
                title={lesson.title}
                isCompleted={!!progresses[lesson._id]?.isCompleted}
                readMinutes={lessonReadMinutes(lesson)}
                colorHex={colorHex}
              />
            ))}
            {lessons.length === 0 && (
              <p className="px-3 py-2.5 text-sm text-ink-muted">
                {t("learnWeb.module.noLessons")}
              </p>
            )}
            {hasPractice && (
              <Link
                href={`/learn/${moduleId}/${submoduleId}/practice`}
                className="group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-card"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  <HelpCircle
                    className="h-4 w-4"
                    style={{
                      color: practiceCompleted
                        ? colorHex
                        : "var(--color-ink-placeholder)",
                    }}
                    aria-hidden
                  />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-secondary transition-colors group-hover:text-ink">
                  {t("learn.submodule.practiceTitle")}
                </span>
                <span className="shrink-0 text-xs text-ink-placeholder">
                  {practiceScore != null && practiceTotal
                    ? `${practiceScore}/${practiceTotal}`
                    : practiceCompleted
                      ? t("common.done")
                      : t("learn.submodule.practiceTitle")}
                </span>
              </Link>
            )}
          </div>
        </Collapse>
      </div>
    </li>
  );
}
