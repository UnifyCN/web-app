"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import {
  ACTIVITY_QUESTION_PREFIX,
  canSubmitLessonActivity,
  isActivityComplete,
  type ActivityAnswers,
  type ActivityItem,
  type ActivityOption,
  type SavedActivity,
} from "@/lib/learn/v2/activity";
import {
  enqueueLessonWrite,
  getActivityInputs,
  saveActivityInput,
  type LessonRef,
} from "@/services/learnV2";
import type { LessonActivityBlock } from "@/lib/learn/v2/types";
import type { SanityBlock } from "@/types";
import { cn } from "@/lib/utils";
import { PortableTextRenderer } from "@/components/learn/PortableTextRenderer";
import type { ActivityRenderProps } from "./LessonReaderV2";

const DRAFT_DELAY_MS = 600;

const activityKey = (lessonId: string) => ["learn-v2", "activity", lessonId];

/**
 * Pending text drafts, kept outside the component (mobile `pendingDrafts`) so
 * leaving the step flushes them instead of dropping the last edit.
 */
const pendingDrafts = new Map<
  string,
  { timer: ReturnType<typeof setTimeout>; run: () => void }
>();

function flushDrafts(scope: string) {
  for (const [key, draft] of [...pendingDrafts]) {
    if (!key.startsWith(scope)) continue;
    clearTimeout(draft.timer);
    pendingDrafts.delete(key);
    draft.run();
  }
}

function dropDrafts(scope: string) {
  for (const [key, draft] of [...pendingDrafts]) {
    if (!key.startsWith(scope)) continue;
    clearTimeout(draft.timer);
    pendingDrafts.delete(key);
  }
}

/** Keep the cached answers in step with what was saved, so going Back to a
 * submitted activity shows it submitted. */
function cacheSaved(
  queryClient: QueryClient,
  lessonId: string,
  activity: string,
  field: string,
  value: string,
  submitted: boolean,
) {
  queryClient.setQueryData<Record<string, SavedActivity>>(
    activityKey(lessonId),
    (old) => {
      const page: SavedActivity = old?.[activity] ?? {
        inputValues: {},
        questionAnswers: {},
        submittedFields: {},
        isSubmitted: false,
      };
      const next: SavedActivity = {
        inputValues: { ...page.inputValues },
        questionAnswers: { ...page.questionAnswers },
        submittedFields: { ...page.submittedFields, [field]: submitted },
        isSubmitted: page.isSubmitted || submitted,
      };
      if (field.startsWith(ACTIVITY_QUESTION_PREFIX)) {
        next.questionAnswers[field.slice(ACTIVITY_QUESTION_PREFIX.length)] =
          JSON.parse(value);
      } else {
        next.inputValues[field] = value;
      }
      return { ...old, [activity]: next };
    },
  );
}

function rich(value: SanityBlock[] | string | undefined) {
  if (!value) return null;
  if (typeof value === "string") return <p>{value}</p>;
  return <PortableTextRenderer value={value} />;
}

/**
 * An activity block in the v2 reader (mobile `LessonBlockActivity`): its
 * instructions with questions and input boxes, Submit, then each option's
 * explanation and the answer box. Next stays closed until it is submitted;
 * a returning learner with a stored submission can continue straight away.
 * Answers save to `user_activity_inputs` like mobile (lib/learn/v2/activity.ts).
 */
export function ActivityStepV2(
  props: ActivityRenderProps & { ids: LessonRef },
) {
  const { t } = useTranslation();
  const saved = useQuery({
    queryKey: activityKey(props.ids.lessonId),
    queryFn: () => getActivityInputs(props.ids.lessonId),
    staleTime: 0,
  });
  if (saved.isPending) {
    return (
      <p className="loading-delayed text-sm text-ink-muted">
        {t("common.loading")}
      </p>
    );
  }
  // Unknown saved answers aren't "no answers": an empty form would make a
  // learner who already submitted redo it, and drafts could overwrite theirs.
  if (saved.isError && !saved.data) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-3 rounded-lg border border-border-card bg-surface-card px-4 py-3 text-sm text-ink-muted"
      >
        <span>{t("common.errorGeneric")}</span>
        <button
          type="button"
          onClick={() => saved.refetch()}
          className="press min-h-11 shrink-0 px-2 font-semibold text-primary"
        >
          {t("common.retry")}
        </button>
      </div>
    );
  }
  return (
    <ActivityForm
      {...props}
      stored={saved.data?.[props.step.activity?._key ?? ""]}
    />
  );
}

function ActivityForm({
  step,
  onReady,
  ids,
  stored,
}: ActivityRenderProps & {
  ids: LessonRef;
  stored: SavedActivity | undefined;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const activity = step.activity as LessonActivityBlock;
  const scope = `${ids.lessonId}|${activity._key}|`;
  const instructions = (activity.instructions ?? []) as ActivityItem[];
  const answerBox = activity.answer_box as unknown as
    | { title?: string; content?: SanityBlock[]; showAfterSubmit?: boolean }
    | undefined;

  // Seeded once from the stored answers; a returning learner with a complete
  // submission can continue straight away.
  const [inputs, setInputs] = useState<Record<string, string>>(
    () => stored?.inputValues ?? {},
  );
  const [answers, setAnswers] = useState<ActivityAnswers>(
    () => stored?.questionAnswers ?? {},
  );
  const [submitted, setSubmitted] = useState(() =>
    isActivityComplete(instructions, stored),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  // A draft that didn't save: shown with a retry, never silently dropped.
  const [draftFailed, setDraftFailed] = useState(false);
  // Edits since the last submit started: an edit during the save means the
  // learner must submit again (mobile `edits`).
  const edits = useRef(0);

  useEffect(() => {
    onReady(submitted);
  }, [submitted, onReady]);

  // Leaving the step saves any draft still waiting for its delay.
  useEffect(() => () => flushDrafts(scope), [scope]);

  const persist = (field: string, value: string, isSubmit = false) =>
    enqueueLessonWrite(`activity|${scope}${field}`, async () => {
      const ok = await saveActivityInput(
        ids,
        activity._key,
        field,
        value,
        isSubmit,
      );
      if (ok)
        cacheSaved(
          queryClient,
          ids.lessonId,
          activity._key,
          field,
          value,
          isSubmit,
        );
      return ok;
    });

  /**
   * Save one draft. On failure (an error or nothing written), the edit is kept
   * in the cache as unsubmitted, so coming back shows it and asks for a submit
   * instead of restoring the old answer as complete, and a retry is offered.
   */
  const saveDraft = (field: string, value: string) =>
    persist(field, value)
      .then((ok) => ok)
      .catch(() => false)
      .then((ok) => {
        if (!ok) {
          cacheSaved(
            queryClient,
            ids.lessonId,
            activity._key,
            field,
            value,
            false,
          );
          setDraftFailed(true);
        }
        return ok;
      });

  async function retryDrafts() {
    const results = await Promise.all([
      ...Object.entries(inputs).map(([k, v]) => saveDraft(k, v)),
      ...Object.entries(answers).map(([k, v]) =>
        saveDraft(ACTIVITY_QUESTION_PREFIX + k, JSON.stringify(v)),
      ),
    ]);
    if (results.every(Boolean)) setDraftFailed(false);
  }

  const edited = () => {
    edits.current += 1;
    setSubmitted(false);
    setError(false);
  };

  const onInput = (key: string, value: string) => {
    setInputs((c) => ({ ...c, [key]: value }));
    edited();
    const draftKey = scope + key;
    const existing = pendingDrafts.get(draftKey);
    if (existing) clearTimeout(existing.timer);
    const run = () => void saveDraft(key, value);
    pendingDrafts.set(draftKey, {
      run,
      timer: setTimeout(() => {
        pendingDrafts.delete(draftKey);
        run();
      }, DRAFT_DELAY_MS),
    });
  };

  const onAnswer = (key: string, value: string | string[]) => {
    setAnswers((c) => ({ ...c, [key]: value }));
    edited();
    void saveDraft(ACTIVITY_QUESTION_PREFIX + key, JSON.stringify(value));
  };

  const canSubmit = canSubmitLessonActivity(instructions, inputs, answers);

  async function submit() {
    if (!canSubmit || saving) return;
    setSaving(true);
    const editsAtSubmit = edits.current;
    dropDrafts(scope);
    try {
      const results = await Promise.all([
        ...Object.entries(inputs).map(([k, v]) => persist(k, v, true)),
        ...Object.entries(answers).map(([k, v]) =>
          persist(ACTIVITY_QUESTION_PREFIX + k, JSON.stringify(v), true),
        ),
      ]);
      // A save that wrote nothing (e.g. signed out) is a failure, and an edit
      // made while saving was not part of this submit.
      if (results.some((ok) => !ok)) {
        setError(true);
        return;
      }
      if (edits.current !== editsAtSubmit) return;
      // Every field was just saved, so earlier draft failures are resolved.
      setDraftFailed(false);
      setSubmitted(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {activity.title && (
        <h2 className="text-lg font-bold text-ink-secondary">
          {activity.title}
        </h2>
      )}
      {instructions.map((block) => (
        <ActivityBlock
          key={block._key}
          block={block}
          inputs={inputs}
          answers={answers}
          submitted={submitted}
          onInput={onInput}
          onAnswer={onAnswer}
        />
      ))}
      {answerBox && (!answerBox.showAfterSubmit || submitted) && (
        <div className="rounded-lg bg-surface-card p-4 text-sm leading-6">
          {answerBox.title && (
            <p className="mb-2 font-semibold text-ink-secondary">
              {answerBox.title}
            </p>
          )}
          {rich(answerBox.content)}
        </div>
      )}
      {draftFailed && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-border-card bg-surface-card px-4 py-3 text-sm text-ink-muted"
        >
          <span>{t("common.errorGeneric")}</span>
          <button
            type="button"
            onClick={() => void retryDrafts()}
            className="press min-h-11 shrink-0 px-2 font-semibold text-primary"
          >
            {t("common.retry")}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t("common.errorGeneric")}
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={saving || submitted || !canSubmit}
        className="press min-h-11 self-start rounded-lg bg-ink-secondary px-6 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitted ? t("common.done") : t("common.submit")}
      </button>
    </div>
  );
}

function ActivityBlock({
  block,
  inputs,
  answers,
  submitted,
  onInput,
  onAnswer,
}: {
  block: ActivityItem;
  inputs: Record<string, string>;
  answers: ActivityAnswers;
  submitted: boolean;
  onInput: (key: string, value: string) => void;
  onAnswer: (key: string, value: string | string[]) => void;
}) {
  switch (block._type) {
    case "block":
      return <div className="text-sm leading-6">{rich([block])}</div>;
    case "small_input_box":
    case "mid_input_box":
    case "large_input_box": {
      const id = `input-${block._key}`;
      const multiline = block._type !== "small_input_box";
      return (
        <div className="flex flex-col gap-2">
          {block.label && (
            <label
              htmlFor={id}
              className="text-sm font-semibold text-ink-secondary"
            >
              {block.label}
            </label>
          )}
          {multiline ? (
            <textarea
              id={id}
              rows={block._type === "large_input_box" ? 6 : 3}
              value={inputs[block._key] ?? ""}
              placeholder={block.placeholder}
              aria-label={block.label ? undefined : block.placeholder}
              onChange={(e) => onInput(block._key, e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary"
            />
          ) : (
            <input
              id={id}
              value={inputs[block._key] ?? ""}
              placeholder={block.placeholder}
              aria-label={block.label ? undefined : block.placeholder}
              onChange={(e) => onInput(block._key, e.target.value)}
              className="min-h-11 rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
            />
          )}
        </div>
      );
    }
    case "multiple_choice_single":
    case "two_options_question":
    case "multiple_choice_multiple": {
      const multiple = block._type === "multiple_choice_multiple";
      const current = answers[block._key];
      const chosen = (o: ActivityOption) =>
        multiple
          ? Array.isArray(current) && current.includes(o.value)
          : current === o.value;
      return (
        <fieldset className="flex min-w-0 flex-col gap-2">
          {block.question_text && (
            <legend className="mb-2 text-sm font-semibold text-ink-secondary">
              {rich(block.question_text)}
            </legend>
          )}
          {(block.options ?? []).map((option) => {
            const isChosen = chosen(option);
            return (
              <div key={option._key} className="flex flex-col gap-1">
                <label
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                    submitted && isChosen
                      ? option.is_correct
                        ? "border-priority-optional bg-priority-optional-bg"
                        : "border-destructive bg-priority-do-now-bg"
                      : isChosen
                        ? "border-primary bg-primary-bg"
                        : "border-border-card hover:bg-surface-card",
                  )}
                >
                  <input
                    type={multiple ? "checkbox" : "radio"}
                    className="accent-primary"
                    name={`q-${block._key}`}
                    checked={isChosen}
                    onChange={() => {
                      if (!multiple) return onAnswer(block._key, option.value);
                      const list = Array.isArray(current) ? current : [];
                      onAnswer(
                        block._key,
                        list.includes(option.value)
                          ? list.filter((v) => v !== option.value)
                          : [...list, option.value],
                      );
                    }}
                  />
                  <span className="min-w-0 flex-1 [&_p]:m-0">
                    {rich(option.text)}
                  </span>
                  {submitted &&
                    isChosen &&
                    (option.is_correct ? (
                      <Check
                        className="size-4 shrink-0 text-priority-optional"
                        aria-hidden
                      />
                    ) : (
                      <X
                        className="size-4 shrink-0 text-destructive"
                        aria-hidden
                      />
                    ))}
                </label>
                {submitted && isChosen && option.explanation?.length ? (
                  <div className="ps-9 text-xs leading-5 text-ink-muted">
                    {rich(option.explanation)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </fieldset>
      );
    }
    case "matching_question":
      return (
        <MatchingQuestion block={block} answers={answers} onAnswer={onAnswer} />
      );
    default:
      return null;
  }
}

/** Pick the matching right-hand item for each left item. A correct match
 * stores the pair key, as mobile does; all pairs matched = answered. */
function MatchingQuestion({
  block,
  answers,
  onAnswer,
}: {
  block: Extract<ActivityItem, { _type: "matching_question" }>;
  answers: ActivityAnswers;
  onAnswer: (key: string, value: string[]) => void;
}) {
  const pairs = block.matching_pairs ?? [];
  const matched = Array.isArray(answers[block._key])
    ? (answers[block._key] as string[])
    : [];
  const [picks, setPicks] = useState<Record<string, string>>({});
  // Right items in a stable shuffled order (reverse), so the answer isn't beside its pair.
  const rights = [...pairs].reverse().map((p) => p.right_item);

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      {block.question_text && (
        <legend className="mb-2 text-sm font-semibold text-ink-secondary">
          {rich(block.question_text)}
        </legend>
      )}
      {pairs.map((pair) => {
        const isMatched = matched.includes(pair._key);
        const pick = picks[pair._key] ?? (isMatched ? pair.right_item : "");
        const wrong = pick !== "" && !isMatched;
        return (
          <label key={pair._key} className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink-secondary">
              {pair.left_item}
            </span>
            <select
              value={pick}
              onChange={(e) => {
                const value = e.target.value;
                setPicks((c) => ({ ...c, [pair._key]: value }));
                const next = matched.filter((k) => k !== pair._key);
                onAnswer(
                  block._key,
                  value === pair.right_item ? [...next, pair._key] : next,
                );
              }}
              aria-invalid={wrong || undefined}
              className={cn(
                "min-h-11 rounded-lg border bg-surface px-3 text-sm",
                isMatched
                  ? "border-priority-optional"
                  : wrong
                    ? "border-destructive"
                    : "border-border",
              )}
            >
              <option value="">—</option>
              {rights.map((right) => (
                <option key={right} value={right}>
                  {right}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </fieldset>
  );
}
