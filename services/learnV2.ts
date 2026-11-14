import {
  createClient,
  getAuthUserId,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import {
  COURSE_V2_QUERY,
  LESSON_V2_QUERY,
  isSanityConfigured,
  mergeI18nOverlay,
  sanityClient,
  type WithI18n,
} from "@/lib/sanity";
import type { SupportedLanguage } from "@/lib/i18n/config";
import { wordCountOfBlocks } from "@/lib/learn/readTime";
import { localizeLesson } from "@/lib/learn/v2/contentBlocks";
import { mergeTranslatedLesson } from "@/lib/learn/v2/i18nMerge";
import {
  buildCompletion,
  buildPageProgress,
  buildResumePosition,
  getLessonTotalPages,
  type LessonPageType,
  type LessonProgressRow,
} from "@/lib/learn/v2/progress";
import type { LessonQuizStub, LessonV2 } from "@/lib/learn/v2/types";
import {
  buildActivityInput,
  groupActivityInputs,
  type ActivityInputRow,
  type SavedActivity,
} from "@/lib/learn/v2/activity";
import type { SanityBlock } from "@/types";
import type { LessonSection } from "@/types/lessonSections";

/**
 * Learn v2 data access (behind NEXT_PUBLIC_LEARN_V2). Content comes from
 * Sanity `content_blocks`; progress goes to the shared `user_lesson_progress`
 * and `learn_progress` tables with the mobile app's semantics (see
 * lib/learn/v2/progress.ts), so a lesson started on one app resumes on the
 * other. Province access stays with the `[moduleId]` layout guard and
 * `getModules` (services/learn.ts), which v2 reuses unchanged.
 */

export interface LessonStubV2 {
  _id: string;
  title: string;
  description?: string | null;
  order: number;
  lesson_page_count?: number;
  activity_page_count?: number;
  ending_page_count?: number;
  quizzes?: LessonQuizStub[];
  /** Estimated reading minutes for the lesson's teaching steps. */
  readingMinutes: number;
  /** `total_pages` for this lesson (steps + quiz questions). */
  totalPages: number;
}

export interface ModuleV2 {
  _id: string;
  title: string;
  description?: string | null;
  order: number;
  practice_count?: number;
  intro_page_count?: number;
  lessons: LessonStubV2[];
}

export interface CourseV2 {
  _id: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  province?: string | null;
  submodules: ModuleV2[];
}

type StepText = {
  content?: SanityBlock[] | null;
  sections?: LessonSection[] | null;
  readingMinutes?: number | null;
};

type RawLessonStub = Omit<LessonStubV2, "readingMinutes" | "totalPages"> & {
  steps?: StepText[] | null;
};

const WORDS_PER_MINUTE = 200;

function sectionBlocks(section: LessonSection): SanityBlock[] {
  const s = section as unknown as Record<string, unknown>;
  const rich = (v: unknown) => (Array.isArray(v) ? (v as SanityBlock[]) : []);
  switch (section._type) {
    case "lessonConcept":
      return rich(s.content);
    case "lessonExample":
      return [...rich(s.theory), ...rich(s.practice)];
    case "lessonVisual":
      return rich(s.content);
    case "lessonFaq":
      return (section.items ?? []).flatMap((i) => rich(i.answer));
    default:
      return [];
  }
}

/**
 * Reading minutes for a lesson: each step's `readingMinutes` when set,
 * otherwise its words / 200 (mobile `StructuredLesson`). At least 1.
 */
export function lessonReadingMinutes(
  steps: StepText[] | null | undefined,
): number {
  let minutes = 0;
  let words = 0;
  for (const step of steps ?? []) {
    if (typeof step.readingMinutes === "number" && step.readingMinutes > 0) {
      minutes += step.readingMinutes;
      continue;
    }
    const blocks = step.sections?.length
      ? step.sections.flatMap(sectionBlocks)
      : (step.content ?? []);
    words += wordCountOfBlocks(blocks);
  }
  return Math.max(1, minutes + Math.ceil(words / WORDS_PER_MINUTE));
}

function toLessonStub(raw: WithI18n<RawLessonStub>): LessonStubV2 {
  const { steps, ...lesson } = mergeI18nOverlay(raw);
  return {
    ...lesson,
    readingMinutes: lessonReadingMinutes(steps),
    totalPages: getLessonTotalPages(lesson),
  };
}

type RawCourse = WithI18n<
  Omit<CourseV2, "submodules"> & {
    submodules?:
      | WithI18n<
          Omit<ModuleV2, "lessons"> & {
            lessons?: WithI18n<RawLessonStub>[] | null;
          }
        >[]
      | null;
  }
>;

/** One course with its modules and lesson stubs. Undefined if not found. */
export async function getCourseV2(
  courseId: string,
  language: SupportedLanguage = "en",
): Promise<CourseV2 | undefined> {
  if (!isSanityConfigured()) return undefined;
  const row = await sanityClient.fetch<RawCourse | null>(COURSE_V2_QUERY, {
    moduleId: courseId,
    lang: language,
  });
  if (!row) return undefined;
  const { submodules, ...course } = mergeI18nOverlay(row);
  return {
    ...course,
    submodules: (submodules ?? []).map((raw) => {
      const { lessons, ...mod } = mergeI18nOverlay(raw);
      return { ...mod, lessons: (lessons ?? []).map(toLessonStub) };
    }),
  };
}

type RawLesson = WithI18n<LessonV2 & { quizzes?: LessonQuizStub[] }>;

/** A lesson with its blocks ordered into steps and its translation applied
 * (mobile `getLesson`). Undefined if not found. */
export async function getLessonV2(
  lessonId: string,
  language: SupportedLanguage = "en",
): Promise<
  (LessonV2 & { quizzes: LessonQuizStub[]; totalPages: number }) | undefined
> {
  if (!isSanityConfigured()) return undefined;
  const row = await sanityClient.fetch<RawLesson | null>(LESSON_V2_QUERY, {
    lessonId,
    lang: language,
  });
  if (!row) return undefined;
  const overlay = row.i18n;
  const lesson = localizeLesson(
    // Mobile's merge: a translation can't change block order, keys or
    // response structure (lib/learn/v2/i18nMerge.ts).
    mergeTranslatedLesson(row),
    overlay,
    language,
  );
  const quizzes = row.quizzes ?? [];
  // A lesson without blocks keeps its legacy arrays; count them (blocks set
  // their own counts in withOrderedLessonBlocks).
  const counts = lesson.content_blocks?.length
    ? lesson
    : {
        lesson_page_count: lesson.pages?.length ?? 0,
        activity_page_count: lesson.activity_pages?.length ?? 0,
        ending_page_count: lesson.ending_pages?.length ?? 0,
      };
  return {
    ...lesson,
    ...counts,
    quizzes,
    totalPages: getLessonTotalPages({ ...counts, quizzes }),
  };
}

/* ---- Progress -------------------------------------------------------- */

const PROGRESS_COLUMNS =
  "sanity_lesson_id, sanity_submodule_id, sanity_module_id, is_completed, is_in_progress, progress_percent, total_pages, completed_pages, current_page_type, current_page_number, current_quiz_id, current_question_number, last_accessed_at";

/**
 * In-memory progress for the env-not-configured (local dev / mock profile)
 * path, so the reader, resume card and percentages work end to end without a
 * database. Real persistence uses `user_lesson_progress` whenever Supabase is
 * configured. Same merge rule as an upsert: later fields win.
 */
const mockProgress = new Map<string, LessonProgressRow>();

function writeMockProgress(body: Record<string, unknown>): boolean {
  const id = body.sanity_lesson_id as string;
  mockProgress.set(id, {
    ...mockProgress.get(id),
    ...body,
  } as LessonProgressRow);
  return true;
}

/** The signed-in user's lesson progress rows. Empty when signed out; the
 * in-memory rows when Supabase isn't configured. */
export async function getLessonProgressRows(): Promise<LessonProgressRow[]> {
  if (!isSupabaseConfigured()) return [...mockProgress.values()];
  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await createClient()
    .from("user_lesson_progress")
    .select(PROGRESS_COLUMNS)
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as LessonProgressRow[];
}

/**
 * Every write to one lesson's progress row runs through one queue, strictly in
 * call order (mobile `enqueueLessonProgressWrite`). Otherwise a slow earlier
 * write can land last and move the resume point back, or mark a completed
 * lesson as in progress again.
 */
const lessonWrites = new Map<string, Promise<unknown>>();

export function enqueueLessonWrite<T>(
  lessonId: string,
  write: () => Promise<T>,
): Promise<T> {
  const previous = lessonWrites.get(lessonId) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(write);
  lessonWrites.set(lessonId, pending);
  const release = () => {
    if (lessonWrites.get(lessonId) === pending) lessonWrites.delete(lessonId);
  };
  pending.then(release, release);
  return pending;
}

async function upsertProgress(
  lessonId: string,
  build: (userId: string) => Record<string, unknown>,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return writeMockProgress(build("mock-user"));
  // Read the user when the write is requested, not when its turn comes.
  const userIdPromise = getAuthUserId();
  return enqueueLessonWrite(lessonId, async () => {
    const userId = await userIdPromise;
    if (!userId) return false;
    const { error } = await createClient()
      .from("user_lesson_progress")
      .upsert(
        { user_id: userId, ...build(userId) },
        { onConflict: "user_id,sanity_lesson_id" },
      );
    if (error) throw error;
    return true;
  });
}

export interface LessonRef {
  lessonId: string;
  submoduleId: string;
  moduleId: string;
}

/** Next was pressed on step `pageNumber`. */
export function saveLessonPage(
  ids: LessonRef,
  pageType: LessonPageType,
  pageNumber: number,
  totalPages: number,
  quiz?: { quizId: string; questionNumber: number },
): Promise<boolean> {
  return upsertProgress(ids.lessonId, () =>
    buildPageProgress(ids, pageType, pageNumber, totalPages, new Date(), quiz),
  );
}

/** A step was opened: save only the resume position. */
export function saveResumePosition(
  ids: LessonRef,
  pageType: LessonPageType,
  pageNumber: number,
  quiz?: { quizId: string; questionNumber: number },
): Promise<boolean> {
  return upsertProgress(ids.lessonId, () =>
    buildResumePosition(ids, pageType, pageNumber, new Date(), quiz),
  );
}

/**
 * The lesson is finished. Then, without blocking, marks the course completed
 * in `learn_progress` if every lesson in it is now complete.
 */
export async function completeLesson(
  ids: LessonRef,
  totalPages: number,
): Promise<boolean> {
  const saved = await upsertProgress(ids.lessonId, () =>
    buildCompletion(ids, totalPages, new Date()),
  );
  if (saved) {
    void maybeMarkCourseCompleted(ids.moduleId).catch((error) =>
      console.error("[learnV2] course completion check failed", error),
    );
  }
  return saved;
}

const COURSE_LESSON_IDS_QUERY = `*[_type == "module" && _id == $moduleId && (language == "en" || !defined(language))][0] {
  "lessonIds": *[_type == "submodule" && references(^._id) && (language == "en" || !defined(language))][] {
    "ids": *[_type == "lesson" && references(^._id) && (language == "en" || !defined(language))]._id
  }.ids[]
}`;

/**
 * Mark a course `completed` in `learn_progress` once all its lessons are
 * complete (mobile `maybeMarkModuleCompleted`). Never downgrades a completed
 * course. A failed write throws; `completeLesson` logs it without blocking.
 */
export async function maybeMarkCourseCompleted(
  moduleId: string,
): Promise<void> {
  if (!isSupabaseConfigured() || !isSanityConfigured()) return;
  const userId = await getAuthUserId();
  if (!userId) return;
  const supabase = createClient();
  const { data: existing } = await supabase
    .from("learn_progress")
    .select("status")
    .eq("user_id", userId)
    .eq("module_id", moduleId)
    .maybeSingle();
  if (existing?.status === "completed") return;

  const result = await sanityClient.fetch<{ lessonIds?: unknown[] } | null>(
    COURSE_LESSON_IDS_QUERY,
    { moduleId },
  );
  const lessonIds = (result?.lessonIds ?? []).filter(
    (id): id is string => typeof id === "string",
  );
  if (lessonIds.length === 0) return;

  const { data: rows, error } = await supabase
    .from("user_lesson_progress")
    .select("sanity_lesson_id")
    .eq("user_id", userId)
    .eq("is_completed", true)
    .in("sanity_lesson_id", lessonIds);
  if (error) return;
  const done = new Set(
    ((rows ?? []) as { sanity_lesson_id: string }[]).map(
      (r) => r.sanity_lesson_id,
    ),
  );
  if (done.size < new Set(lessonIds).size) return;

  const at = new Date().toISOString();
  const { error: upsertError } = await supabase.from("learn_progress").upsert(
    {
      user_id: userId,
      module_id: moduleId,
      status: "completed",
      completed_at: at,
      updated_at: at,
    },
    { onConflict: "user_id,module_id" },
  );
  if (upsertError) throw upsertError;
}

/* ---- Activity answers ------------------------------------------------ */

const mockActivityInputs = new Map<
  string,
  ActivityInputRow & { sanity_lesson_id: string }
>();

/** The user's stored activity answers for one lesson, grouped by block. */
export async function getActivityInputs(
  lessonId: string,
): Promise<Record<string, SavedActivity>> {
  if (!isSupabaseConfigured()) {
    return groupActivityInputs(
      [...mockActivityInputs.values()].filter(
        (r) => r.sanity_lesson_id === lessonId,
      ),
    );
  }
  const userId = await getAuthUserId();
  if (!userId) return {};
  const { data, error } = await createClient()
    .from("user_activity_inputs")
    .select("activity_page_key, input_field_key, input_value, is_submitted")
    .eq("user_id", userId)
    .eq("sanity_lesson_id", lessonId);
  if (error) throw error;
  return groupActivityInputs((data ?? []) as ActivityInputRow[]);
}

/** Save one activity field (a draft, or with `submitted` a submit). */
export async function saveActivityInput(
  ids: LessonRef,
  activityKey: string,
  fieldKey: string,
  value: string,
  submitted: boolean,
): Promise<boolean> {
  const body = buildActivityInput(
    ids,
    activityKey,
    fieldKey,
    value,
    submitted,
    new Date(),
  );
  if (!isSupabaseConfigured()) {
    mockActivityInputs.set(`${ids.lessonId}|${activityKey}|${fieldKey}`, body);
    return true;
  }
  const userId = await getAuthUserId();
  if (!userId) return false;
  const { error } = await createClient()
    .from("user_activity_inputs")
    .upsert(
      { user_id: userId, ...body },
      {
        onConflict:
          "user_id,sanity_lesson_id,activity_page_key,input_field_key",
      },
    );
  if (error) throw error;
  return true;
}

/* ---- Quick Check answers (shared with mobile) ------------------------- */

// `ownerId` (optional) is the account a queued save belongs to. It is used
// as the row's user_id, so own-row RLS rejects the write if another account
// is signed in by the time it runs.

/*
 * Mirrors mobile services/progress/progressService.ts: one in-progress
 * attempt per user + quiz in `user_quiz_attempts` (completed_at null), its
 * answers in `user_quiz_responses` keyed by question `_key`. Finishing the
 * quiz closes the attempt, so the next visit starts fresh, as on mobile.
 */

export interface QuizAttemptState {
  attemptId: string;
  /** Stored answers by question `_key`, in mobile's format. */
  responses: Record<string, unknown>;
}

const mockAttempts = new Map<
  string,
  QuizAttemptState & { quizId: string; open: boolean }
>();

/** The open attempt for a quiz and its answers, or null when none is open. */
export async function getOpenQuizAttempt(
  quizId: string,
  ownerId?: string | null,
): Promise<QuizAttemptState | null> {
  if (!isSupabaseConfigured()) {
    const open = [...mockAttempts.values()].find(
      (a) => a.quizId === quizId && a.open,
    );
    return open
      ? { attemptId: open.attemptId, responses: { ...open.responses } }
      : null;
  }
  const userId = ownerId ?? (await getAuthUserId());
  if (!userId) return null;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_quiz_attempts")
    .select("id")
    .eq("user_id", userId)
    .eq("sanity_quiz_id", quizId)
    .is("completed_at", null)
    .order("attempt_number", { ascending: false })
    .limit(1);
  if (error) throw error;
  const attemptId = (data?.[0] as { id?: string } | undefined)?.id;
  if (!attemptId) return null;
  const { data: rows, error: rowsError } = await supabase
    .from("user_quiz_responses")
    .select("sanity_question_id, user_answer")
    .eq("user_id", userId)
    .eq("quiz_attempt_id", attemptId);
  if (rowsError) throw rowsError;
  const responses: Record<string, unknown> = {};
  for (const row of (rows ?? []) as {
    sanity_question_id: string;
    user_answer: unknown;
  }[]) {
    responses[row.sanity_question_id] = row.user_answer;
  }
  return { attemptId, responses };
}

/** Whether the user has ever started this quiz in mobile's tables (an open
 * or a finished attempt). Once one exists, web's old progress row is stale. */
export async function hasQuizAttempt(quizId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return [...mockAttempts.values()].some((a) => a.quizId === quizId);
  }
  const userId = await getAuthUserId();
  if (!userId) return false;
  const { data, error } = await createClient()
    .from("user_quiz_attempts")
    .select("id")
    .eq("user_id", userId)
    .eq("sanity_quiz_id", quizId)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** The open attempt's id, starting a new attempt if none is open (mobile
 * `getOrCreateInProgressQuizAttempt`, including its re-read after a race). */
export async function getOrCreateQuizAttempt(
  quizId: string,
  ids: LessonRef,
  ownerId?: string | null,
): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    const open = [...mockAttempts.values()].find(
      (a) => a.quizId === quizId && a.open,
    );
    if (open) return open.attemptId;
    const attemptId = `mock-${quizId}-${mockAttempts.size + 1}`;
    mockAttempts.set(attemptId, {
      attemptId,
      quizId,
      responses: {},
      open: true,
    });
    return attemptId;
  }
  const existing = await getOpenQuizAttempt(quizId, ownerId);
  if (existing) return existing.attemptId;
  const userId = ownerId ?? (await getAuthUserId());
  if (!userId) return null;
  const supabase = createClient();
  const { data: last } = await supabase
    .from("user_quiz_attempts")
    .select("attempt_number")
    .eq("user_id", userId)
    .eq("sanity_quiz_id", quizId)
    .order("attempt_number", { ascending: false })
    .limit(1);
  const lastNumber = (last?.[0] as { attempt_number?: number } | undefined)
    ?.attempt_number;
  const { data, error } = await supabase
    .from("user_quiz_attempts")
    .insert({
      user_id: userId,
      sanity_quiz_id: quizId,
      sanity_lesson_id: ids.lessonId,
      sanity_submodule_id: ids.submoduleId,
      sanity_module_id: ids.moduleId,
      attempt_number: lastNumber ? lastNumber + 1 : 1,
      total_questions: 0,
    })
    .select("id")
    .single();
  if (!error && data) return (data as { id: string }).id;
  // Lost a race to another tab or app creating the same attempt: re-read once.
  return (await getOpenQuizAttempt(quizId, ownerId))?.attemptId ?? null;
}

/** Save one answer on an attempt (mobile `submitQuizAnswer`). */
export async function saveQuizResponse(
  attemptId: string,
  questionId: string,
  questionType: string,
  answer: string | string[],
  isCorrect: boolean,
  ownerId?: string | null,
): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    const attempt = mockAttempts.get(attemptId);
    if (attempt) attempt.responses[questionId] = answer;
    return true;
  }
  const userId = ownerId ?? (await getAuthUserId());
  if (!userId) return false;
  const { error } = await createClient().from("user_quiz_responses").upsert(
    {
      user_id: userId,
      quiz_attempt_id: attemptId,
      sanity_question_id: questionId,
      question_type: questionType,
      user_answer: answer,
      is_correct: isCorrect,
      answered_at: new Date().toISOString(),
    },
    { onConflict: "quiz_attempt_id,sanity_question_id" },
  );
  if (error) throw error;
  return true;
}

/** Close an attempt so the next visit starts fresh (mobile
 * `markQuizAttemptComplete`). */
export async function closeQuizAttempt(
  attemptId: string,
  ownerId?: string | null,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    const attempt = mockAttempts.get(attemptId);
    if (attempt) attempt.open = false;
    return;
  }
  const { error } = await createClient()
    .from("user_quiz_attempts")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", attemptId)
    .eq("user_id", ownerId ?? (await getAuthUserId()) ?? "")
    .is("completed_at", null);
  if (error) throw error;
}
