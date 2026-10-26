"use client";

import { AlertCircle, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  contextPlace,
  hasVisibleContext,
  latestCheck,
  type CompanionContext,
} from "@/lib/companionContext";
import { useContextLabels } from "./contextLabels";

/**
 * Missing, conflicting or unavailable information, in words. Shown in the
 * answer card and at the top of the drawer, so it is visible without opening
 * anything. Uses text and an icon, not colour alone.
 */
export function ContextNotice({ context }: { context: CompanionContext }) {
  const { t } = useTranslation();
  const labels = useContextLabels();
  const notes: string[] = [];
  const c = context.clarification;
  if (c?.kind === "profile_conflict" && c.field === "province") {
    notes.push(
      t("companion.context.clarifyProvince", {
        profile: c.profileValue,
        conversation: c.conversationValue,
      }),
    );
  } else if (c?.kind === "profile_conflict" && c.field === "arrival_date") {
    notes.push(
      t("companion.context.clarifyArrival", {
        profile: labels.fieldValue("arrival_date", c.profileValue),
        conversation: labels.arrival(c.conversationValue),
      }),
    );
  } else if (c?.kind === "missing") {
    notes.push(t("companion.context.missingProvince"));
  }
  if (context.guidance.status === "unavailable") notes.push(t("companion.context.unavailable"));
  if (context.guidance.status === "conflict") notes.push(t("companion.context.conflict"));
  if (context.unreadable.includes("checklist")) notes.push(t("companion.context.checklistUnreadable"));
  if (notes.length === 0) return null;
  return (
    <div className="space-y-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-ink-secondary">
      {notes.map((note) => (
        <p key={note} className="flex items-start gap-1.5">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <span>{note}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * The context line under an answer (direction B): a few quiet chips naming
 * what the answer used, any notice, the latest official check time, and the
 * "Sources and context" button that opens the drawer.
 */
export function ContextSummary({
  context,
  onOpen,
}: {
  context: CompanionContext | null | undefined;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const labels = useContextLabels();
  if (!context || !hasVisibleContext(context)) return null;

  const chips: string[] = [];
  const place = contextPlace(context);
  if (place) chips.push(place);
  const arrival = context.items
    .find((i) => i.kind === "conversation_detail")
    ?.fields.find((f) => f.key === "arrival");
  if (arrival) chips.push(labels.arrival(arrival.value));
  const taskCount = context.items.filter((i) => i.kind === "checklist_task").length;
  if (taskCount > 0) chips.push(t("companion.context.tasksUsed", { number: taskCount }));
  const checked = latestCheck(context);

  return (
    <div className="mt-3 space-y-2">
      {chips.length > 0 && (
        <ul aria-label={t("companion.context.usedAria")} className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <li key={chip} dir="auto" className="rounded-md bg-surface-gray px-2 py-0.5 text-xs text-ink-muted">
              {chip}
            </li>
          ))}
        </ul>
      )}
      <ContextNotice context={context} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {checked && (
          <p className="flex items-center gap-1 text-xs text-ink-muted">
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t("companion.context.checkedAt", { time: labels.time(checked) })}
          </p>
        )}
        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            aria-haspopup="dialog"
            className="min-h-11 cursor-pointer text-xs font-semibold text-mention-blue underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary sm:min-h-0"
          >
            {t("companion.context.openDetails")}
          </button>
        )}
      </div>
    </div>
  );
}
