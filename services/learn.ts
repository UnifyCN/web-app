import type {
  LearningProgressSummary,
  LearnModuleView,
  LessonProgress,
  LessonQuizProgress,
  ModuleStatus,
  PracticeProgress,
  SanityLesson,
  SanityLessonQuiz,
  SanityModule,
  SanityPractice,
  SanitySubmodule,
} from "@/types";
import {
  createClient,
  getAuthUserId,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import {
  isSanityConfigured,
  sanityClient,
  mergeI18nOverlay,
  type WithI18n,
  MODULES_LIST_QUERY,
  MODULE_DETAIL_QUERY,
  LESSON_DETAIL_QUERY,
  PRACTICES_BY_SUBMODULE_QUERY,
  LESSON_QUIZ_QUERY,
} from "@/lib/sanity";
import type { SupportedLanguage } from "@/lib/i18n/config";
import {
  getMockLessonById,
  getMockModuleById,
  mockModules,
} from "@/lib/mock/modules";
import {
  getMockLessonQuiz,
  getMockPracticesBySubmodule,
} from "@/lib/mock/practices";
import { mockLearningProgress } from "@/lib/mock/progress";

/**
 * Learn data access. Sanity owns module/submodule/lesson content; Supabase
 * owns per-user progress (`learn_progress`, `user_lesson_progress`) and
 * favourites (`learn_favourites`). Each function guards with the relevant
 * configured + auth checks and falls back to mock data when env vars
 * aren't set (matches the Community/Companion pattern).
 */

interface LearnProgressRow {
  module_id: string;
  status: ModuleStatus;
  completed_at: string | null;
  updated_at: string;
}

interface LessonProgressRow {
  sanity_lesson_id: string;
  progress_percent: number;
  is_completed: boolean;
  updated_at: string;
}

function rowToLessonProgress(row: LessonProgressRow): LessonProgress {
  return {
    sanityLessonId: row.sanity_lesson_id,
    progressPercent: Number(row.progress_percent),
    isCompleted: row.is_completed,
    updatedAt: row.updated_at,
  };
}

interface PracticeProgressRow {
  sanity_submodule_id: string;
  current_question_index: number;
  current_submitted: boolean;
  answers: Record<string, string[]> | null;
  is_completed: boolean;
  score: number | null;
  total_questions: number | null;
  updated_at: string;
}

function rowToPracticeProgress(row: PracticeProgressRow): PracticeProgress {
  return {
    submoduleId: row.sanity_submodule_id,
    currentQuestionIndex: row.current_question_index,
    currentSubmitted: row.current_submitted ?? false,
    answers: row.answers ?? {},
    isCompleted: row.is_completed,
    score: row.score,
    totalQuestions: row.total_questions,
    updatedAt: row.updated_at,
  };
}

/** Raw module row as fetched: each node may carry a translated-content
 * overlay (see lib/sanity.ts). Merged away before mapping to view types. */
type ModuleRow = WithI18n<SanityModule> & {
  submodules?: (WithI18n<SanitySubmodule> & {
    lessons?: WithI18n<SanityLesson>[];
  })[];
};

/** Merge the language overlay on a module and every nested submodule/lesson.
 * `_id`s are untouched — only content fields (title, description, …) change. */
function mergeModuleTreeI18n(mod: ModuleRow): SanityModule {
  const merged: SanityModule = mergeI18nOverlay(mod);
  return {
    ...merged,
    submodules: (mod.submodules ?? []).map((sub) => {
      const s: SanitySubmodule = mergeI18nOverlay(sub);
      return {
        ...s,
        lessons: (sub.lessons ?? []).map((l): SanityLesson =>
          mergeI18nOverlay(l),
        ),
      };
    }),
  };
}

/** Real percent from a set of completed-lesson IDs over the module's total. */
function computeModulePercent(
  lessonIds: string[],
  completedSet: Set<string>,
): number {
  if (lessonIds.length === 0) return 0;
  const done = lessonIds.filter((id) => completedSet.has(id)).length;
  return Math.round((done / lessonIds.length) * 100);
}

/* ---- Modules ---------------------------------------------------------- */

/**
 * In-memory favourites for the env-not-configured (local-dev / mock) path, so
 * the star toggle persists across refetches within a session. Real persistence
 * uses the `learn_favourites` table whenever Supabase is configured.
 */
const mockFavouriteModuleIds = new Set<string>();

export async function getModules(
  language: SupportedLanguage = "en",
): Promise<LearnModuleView[]> {
  if (!isSanityConfigured()) {
    return mockModules.map((m) => ({
      ...m,
      isFavourite: mockFavouriteModuleIds.has(m._id),
    }));
  }

  const rows = await sanityClient.fetch<ModuleRow[]>(MODULES_LIST_QUERY, {
    lang: language,
  });
  const sanityModules = rows.map(mergeModuleTreeI18n);

  // Per-user merge: only when Supabase is configured AND the caller is
  // signed in. Otherwise return the Sanity modules with default state
  // (no progress, no favourites).
  let progressByModuleId: Record<string, LearnProgressRow> = {};
  let favouriteIds = new Set<string>();
  let completedLessonIds = new Set<string>();

  if (isSupabaseConfigured()) {
    const userId = await getAuthUserId();
    if (userId) {
      const supabase = createClient();
      const [progressRes, favRes, lessonsRes] = await Promise.all([
        supabase
          .from("learn_progress")
          .select("module_id, status, completed_at, updated_at")
          .eq("user_id", userId),
        supabase
          .from("learn_favourites")
          .select("sanity_module_id")
          .eq("user_id", userId),
        supabase
          .from("user_lesson_progress")
          .select("sanity_lesson_id, is_completed")
          .eq("user_id", userId)
          .eq("is_completed", true),
      ]);
      if (progressRes.error) throw progressRes.error;
      if (favRes.error) throw favRes.error;
      if (lessonsRes.error) throw lessonsRes.error;

      progressByModuleId = Object.fromEntries(
        ((progressRes.data ?? []) as LearnProgressRow[]).map((r) => [
          r.module_id,
          r,
        ]),
      );
      favouriteIds = new Set(
        ((favRes.data ?? []) as { sanity_module_id: string }[]).map(
          (r) => r.sanity_module_id,
        ),
      );
      completedLessonIds = new Set(
        ((lessonsRes.data ?? []) as { sanity_lesson_id: string }[]).map(
          (r) => r.sanity_lesson_id,
        ),
      );
    }
  } else {
    // Env-not-configured: reflect the in-memory mock favourites.
    favouriteIds = mockFavouriteModuleIds;
  }

  return sanityModules.map((mod) => {
    const status: ModuleStatus =
      progressByModuleId[mod._id]?.status ?? "not_started";
    const lessonIds = (mod.submodules ?? []).flatMap((s) =>
      (s.lessons ?? []).map((l) => l._id),
    );
    return {
      ...mod,
      status,
      progressPercent: computeModulePercent(lessonIds, completedLessonIds),
      isFavourite: favouriteIds.has(mod._id),
    };
  });
}

export async function getModule(
  moduleId: string,
  language: SupportedLanguage = "en",
): Promise<LearnModuleView | undefined> {
  if (!isSanityConfigured()) {
    const mock = getMockModuleById(moduleId);
    return mock
      ? { ...mock, isFavourite: mockFavouriteModuleIds.has(moduleId) }
      : mock;
  }

  const row = await sanityClient.fetch<ModuleRow | null>(MODULE_DETAIL_QUERY, {
    moduleId,
    lang: language,
  });
  if (!row) return undefined;
  const sanityModule = mergeModuleTreeI18n(row);

  let status: ModuleStatus = "not_started";
  let isFavourite = false;
  let progressPercent = 0;

  if (isSupabaseConfigured()) {
    const userId = await getAuthUserId();
    if (userId) {
      const supabase = createClient();
      const [progressRes, favRes, lessonsRes] = await Promise.all([
        supabase
          .from("learn_progress")
          .select("status, completed_at")
          .eq("user_id", userId)
          .eq("module_id", moduleId)
          .maybeSingle(),
        supabase
          .from("learn_favourites")
          .select("sanity_module_id")
          .eq("user_id", userId)
          .eq("sanity_module_id", moduleId)
          .maybeSingle(),
        supabase
          .from("user_lesson_progress")
          .select("sanity_lesson_id, is_completed")
          .eq("user_id", userId),
      ]);
      if (progressRes.error) throw progressRes.error;
      if (favRes.error) throw favRes.error;
      if (lessonsRes.error) throw lessonsRes.error;

      status = (progressRes.data?.status as ModuleStatus) ?? "not_started";
      isFavourite = !!favRes.data;

      // Real progressPercent: completed lessons in this module / total.
      const lessonIds = (sanityModule.submodules ?? []).flatMap((s) =>
        (s.lessons ?? []).map((l) => l._id),
      );
      const completedByLesson = new Map(
        (
          (lessonsRes.data ?? []) as {
            sanity_lesson_id: string;
            is_completed: boolean;
          }[]
        ).map((r) => [r.sanity_lesson_id, r.is_completed]),
      );
      const total = lessonIds.length;
      const completed = lessonIds.filter((id) =>
        completedByLesson.get(id),
      ).length;
      progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
    }
  } else {
    // Env-not-configured: reflect the in-memory mock favourites.
    isFavourite = mockFavouriteModuleIds.has(moduleId);
  }

  return {
    ...sanityModule,
    status,
    progressPercent,
    isFavourite,
  };
}

/* ---- Lesson body ------------------------------------------------------ */

export async function getLesson(
  lessonId: string,
  language: SupportedLanguage = "en",
): Promise<SanityLesson | undefined> {
  if (!isSanityConfigured()) return getMockLessonById(lessonId);

  const lesson = await sanityClient.fetch<WithI18n<SanityLesson> | null>(
    LESSON_DETAIL_QUERY,
    { lessonId, lang: language },
  );
  if (!lesson) return undefined;
  return mergeI18nOverlay(lesson);
}

/* ---- Practices (quiz content) ---------------------------------------- */

/**
 * Every practice referencing a submodule, ordered by `order_number`. Includes
 * BOTH shapes: `quiz` practices (questions in `questions[]`, e.g. "Leasing Quick
 * Check", "Foundation of Budgeting Practice") and `activity` practices (questions
 * in `pages[].instructions[]`, e.g. "Quick Check: Red Flags"). `flattenPractices`
 * handles both.
 *
 * No title-based filtering — this mirrors the mobile app, which surfaces every
 * practice for a submodule on the section Practice flow, including lesson-level
 * reflections/activities the content team titles "Lesson X.Y …" (e.g. "Lesson 1.1:
 * Self Reflection"). Practices reference a submodule, not a lesson, and neither the
 * web nor the mobile lesson reading flow renders them inline — they're reached only
 * from the section Practice card.
 */
export async function getPractices(
  submoduleId: string,
  language: SupportedLanguage = "en",
): Promise<SanityPractice[]> {
  if (!isSanityConfigured()) return getMockPracticesBySubmodule(submoduleId);

  const practices = await sanityClient.fetch<WithI18n<SanityPractice>[]>(
    PRACTICES_BY_SUBMODULE_QUERY,
    { submoduleId, lang: language },
  );
  return (practices ?? [])
    .map((row): SanityPractice => mergeI18nOverlay(row))
    .sort((a, b) => a.order_number - b.order_number);
}

/* ---- Lesson Quick Checks (lesson-level quizzes) ----------------------- */

/** The lesson's "Quick Check" quizzes (`_type == "quiz"`, ordered). */
export async function getLessonQuiz(
  lessonId: string,
  language: SupportedLanguage = "en",
): Promise<SanityLessonQuiz[]> {
  if (!isSanityConfigured()) return getMockLessonQuiz(lessonId);

  const quizzes = await sanityClient.fetch<WithI18n<SanityLessonQuiz>[]>(
    LESSON_QUIZ_QUERY,
    { lessonId, lang: language },
  );
  return (quizzes ?? [])
    .map((row): SanityLessonQuiz => mergeI18nOverlay(row))
    .sort((a, b) => a.order_number - b.order_number);
}

/* ---- Lesson progresses ----------------------------------------------- */

/**
 * Fetch the user's lesson progress rows. The set is small (one row per
 * started lesson, typical user has well under 100) so we pull all rows in
 * one query and let pages filter to the lessons they care about.
 */
export async function getAllLessonProgresses(): Promise<
  Record<string, LessonProgress>
> {
  if (!isSupabaseConfigured()) return {};
  const userId = await getAuthUserId();
  if (!userId) return {};

  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_lesson_progress")
    .select("sanity_lesson_id, progress_percent, is_completed, updated_at")
    .eq("user_id", userId);
  if (error) throw error;

  return Object.fromEntries(
    ((data ?? []) as LessonProgressRow[]).map((row) => [
      row.sanity_lesson_id,
      rowToLessonProgress(row),
    ]),
  );
}

/* ---- Practice progress ------------------------------------------------ */

/** The user's quiz progress for one section, or null if none/unauthenticated. */
export async function getPracticeProgress(
  submoduleId: string,
): Promise<PracticeProgress | null> {
  if (!isSupabaseConfigured()) return null;
  const userId = await getAuthUserId();
  if (!userId) return null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_submodule_practice_progress")
    .select(
      "sanity_submodule_id, current_question_index, current_submitted, answers, is_completed, score, total_questions, updated_at",
    )
    .eq("user_id", userId)
    .eq("sanity_submodule_id", submoduleId)
    .maybeSingle();
  if (error) throw error;

  return data ? rowToPracticeProgress(data as PracticeProgressRow) : null;
}

/**
 * All of the user's section quiz progress, keyed by sanity_submodule_id. One
 * query for every row (the set is small) — used by the module table of contents
 * to show per-section Quick Check scores without an N-query fan-out.
 */
export async function getAllPracticeProgresses(): Promise<
  Record<string, PracticeProgress>
> {
  if (!isSupabaseConfigured()) return {};
  const userId = await getAuthUserId();
  if (!userId) return {};

  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_submodule_practice_progress")
    .select(
      "sanity_submodule_id, current_question_index, current_submitted, answers, is_completed, score, total_questions, updated_at",
    )
    .eq("user_id", userId);
  if (error) throw error;

  return Object.fromEntries(
    ((data ?? []) as PracticeProgressRow[]).map((row) => [
      row.sanity_submodule_id,
      rowToPracticeProgress(row),
    ]),
  );
}

export interface UpsertPracticeProgressInput {
  submoduleId: string;
  moduleId?: string;
  currentQuestionIndex: number;
  currentSubmitted: boolean;
  answers: Record<string, string[]>;
  isCompleted: boolean;
  score?: number | null;
  totalQuestions?: number | null;
}

export async function upsertPracticeProgress(
  input: UpsertPracticeProgressInput,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const userId = await getAuthUserId();
  // Signed-out sessions: progress writes are a no-op (graceful degradation).
  if (!userId) return;

  const supabase = createClient();
  const { error } = await supabase.from("user_submodule_practice_progress").upsert(
    {
      user_id: userId,
      sanity_submodule_id: input.submoduleId,
      sanity_module_id: input.moduleId ?? null,
      current_question_index: input.currentQuestionIndex,
      current_submitted: input.currentSubmitted,
      answers: input.answers,
      is_completed: input.isCompleted,
      score: input.score ?? null,
      total_questions: input.totalQuestions ?? null,
      completed_at: input.isCompleted ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,sanity_submodule_id" },
  );
  if (error) throw error;
}

/* ---- Practice AI feedback (practice-feedback edge function) ----------- */

/** UI state for a question's AI coach feedback (held in component state). */
export interface PracticeFeedbackState {
  status: "loading" | "done" | "error";
  text?: string;
}

export interface PracticeFeedbackInput {
  /** Plain-text question prompt (flatten Portable Text with portableTextToPlain). */
  questionText: string;
  /** The learner's free-text answer. */
  userAnswer: string;
  /** Accepted/model answer for short_answer & fill_blank; omit for reflections. */
  expectedAnswer?: string;
  /** Parent practice doc title — shown to the model for context. */
  practiceTitle?: string;
}

// Local-dev / env-not-configured fallback (mirrors companion's MOCK_REPLY). The
// real feedback comes from the practice-feedback edge function.
const MOCK_FEEDBACK =
  "Nice work taking the time to write this out. You've captured the main idea " +
  "well — to make it even stronger, try adding a specific example or detail " +
  "that ties it back to your own situation in Canada. Keep it up!";

/**
 * Calls the `practice-feedback` edge function for coach-style feedback on a
 * free-text practice answer. The browser Supabase client attaches the user's
 * JWT automatically. Falls back to a canned reply when Supabase isn't
 * configured (local dev) so the UI can be exercised without the backend.
 */
export async function requestPracticeFeedback(
  input: PracticeFeedbackInput,
): Promise<{ feedback: string }> {
  if (!isSupabaseConfigured()) {
    return { feedback: MOCK_FEEDBACK };
  }

  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke<{ feedback: string }>(
    "practice-feedback",
    {
      body: {
        questionText: input.questionText,
        userAnswer: input.userAnswer,
        expectedAnswer: input.expectedAnswer,
        practiceTitle: input.practiceTitle,
      },
    },
  );

  if (error) {
    // supabase-js FunctionsHttpError carries the Response on `.context`.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      let errBody: { error?: string } = {};
      try {
        errBody = await ctx.json();
      } catch {
        // non-JSON error body — fall through to the generic message
      }
      throw new Error(errBody?.error ?? `practice-feedback failed (${ctx.status})`);
    }
    throw error;
  }

  if (!data || typeof data.feedback !== "string") {
    throw new Error("practice-feedback returned no feedback");
  }

  return { feedback: data.feedback };
}

/* ---- Lesson Quick Check progress -------------------------------------- */

interface LessonQuizProgressRow {
  sanity_lesson_id: string;
  answers: Record<string, string[]> | null;
  current_question_index: number;
  current_submitted: boolean;
  is_completed: boolean;
  score: number | null;
  total_questions: number | null;
  updated_at: string;
}

function rowToLessonQuizProgress(row: LessonQuizProgressRow): LessonQuizProgress {
  return {
    lessonId: row.sanity_lesson_id,
    answers: row.answers ?? {},
    currentQuestionIndex: row.current_question_index,
    currentSubmitted: row.current_submitted ?? false,
    isCompleted: row.is_completed,
    score: row.score,
    totalQuestions: row.total_questions,
    updatedAt: row.updated_at,
  };
}

/** The user's Quick Check completion for one lesson, or null. */
export async function getLessonQuizProgress(
  lessonId: string,
): Promise<LessonQuizProgress | null> {
  if (!isSupabaseConfigured()) return null;
  const userId = await getAuthUserId();
  if (!userId) return null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_lesson_quiz_progress")
    .select(
      "sanity_lesson_id, answers, current_question_index, current_submitted, is_completed, score, total_questions, updated_at",
    )
    .eq("user_id", userId)
    .eq("sanity_lesson_id", lessonId)
    .maybeSingle();
  if (error) throw error;

  return data ? rowToLessonQuizProgress(data as LessonQuizProgressRow) : null;
}

export interface UpsertLessonQuizProgressInput {
  lessonId: string;
  isCompleted: boolean;
  score?: number | null;
  totalQuestions?: number | null;
  /** Resume state: question `_key` → the user's selection(s). */
  answers: Record<string, string[]>;
  currentQuestionIndex: number;
  currentSubmitted: boolean;
}

export async function upsertLessonQuizProgress(
  input: UpsertLessonQuizProgressInput,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const userId = await getAuthUserId();
  // Signed-out sessions: progress writes are a no-op (graceful degradation).
  if (!userId) return;

  const supabase = createClient();
  const { error } = await supabase.from("user_lesson_quiz_progress").upsert(
    {
      user_id: userId,
      sanity_lesson_id: input.lessonId,
      answers: input.answers,
      current_question_index: input.currentQuestionIndex,
      current_submitted: input.currentSubmitted,
      is_completed: input.isCompleted,
      score: input.score ?? null,
      total_questions: input.totalQuestions ?? null,
      completed_at: input.isCompleted ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,sanity_lesson_id" },
  );
  if (error) throw error;
}

/* ---- Home right-panel summary ----------------------------------------- */

export async function getLearningProgressSummary(
  language: SupportedLanguage = "en",
): Promise<LearningProgressSummary[]> {
  // Mock fallback only kicks in when env vars aren't set (local dev). A
  // signed-out user in a configured environment gets an empty list — they
  // shouldn't see other-people's-shaped placeholder data.
  if (!isSupabaseConfigured() || !isSanityConfigured()) {
    return mockLearningProgress;
  }
  const userId = await getAuthUserId();
  if (!userId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("learn_progress")
    .select("module_id, status, updated_at")
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as { module_id: string; updated_at: string }[];
  if (rows.length === 0) return [];

  // Pull the title/colour + lesson IDs for the in-progress modules so we
  // can compute real percent. One Sanity query + one Supabase query, both
  // in parallel.
  const moduleIds = rows.map((r) => r.module_id);
  type SummaryModuleRow = Pick<SanityModule, "_id" | "title" | "colorTheme"> & {
    lessonIds?: string[];
    i18n?: { title?: string | null } | null;
  };
  const [summaryRows, lessonsRes] = await Promise.all([
    sanityClient.fetch<SummaryModuleRow[]>(
      // Base-language guards on the nested listings keep lessonIds scoped to
      // base docs (progress is tracked against base ids); the overlay only
      // localizes the module title shown on the Home progress card.
      `*[_type == "module" && _id in $ids]{
        _id, title, colorTheme { hex },
        "i18n": select($lang != "en" => *[_type == "translation.metadata" && references(^._id)][0].translations[_key == $lang][0].value->{ title }, null),
        "lessonIds": *[_type == "submodule" && references(^._id) && (language == "en" || !defined(language))][]{
          "ids": *[_type == "lesson" && references(^._id) && (language == "en" || !defined(language))]._id
        }.ids[]
      }`,
      { ids: moduleIds, lang: language },
    ),
    supabase
      .from("user_lesson_progress")
      .select("sanity_lesson_id, is_completed")
      .eq("user_id", userId)
      .eq("is_completed", true),
  ]);
  if (lessonsRes.error) throw lessonsRes.error;

  const completedSet = new Set(
    ((lessonsRes.data ?? []) as { sanity_lesson_id: string }[]).map(
      (r) => r.sanity_lesson_id,
    ),
  );
  const sanityById = new Map(summaryRows.map((m) => [m._id, m]));

  // Preserve learn_progress ordering (most-recently-updated first).
  return rows
    .map((r) => {
      const mod = sanityById.get(r.module_id);
      if (!mod) return null;
      return {
        moduleId: mod._id,
        moduleName: mod.i18n?.title ?? mod.title,
        progressPercent: computeModulePercent(
          mod.lessonIds ?? [],
          completedSet,
        ),
        colorHex: mod.colorTheme?.hex ?? null,
      } satisfies LearningProgressSummary;
    })
    .filter((x): x is LearningProgressSummary => x !== null);
}

/* ---- Mutations -------------------------------------------------------- */

export async function setModuleStatus(
  moduleId: string,
  status: ModuleStatus,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const userId = await getAuthUserId();
  if (!userId) throw new Error("setModuleStatus: no auth session");

  const supabase = createClient();
  const { error } = await supabase.from("learn_progress").upsert(
    {
      user_id: userId,
      module_id: moduleId,
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,module_id" },
  );
  if (error) throw error;
}

export async function setLessonProgress(
  lessonId: string,
  submoduleId: string,
  moduleId: string,
  progressPercent: number,
  isCompleted: boolean,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const userId = await getAuthUserId();
  if (!userId) throw new Error("setLessonProgress: no auth session");

  const supabase = createClient();
  // sanity_submodule_id + sanity_module_id are NOT NULL on the shared (mobile)
  // schema, so both must be supplied alongside the lesson id.
  const { error } = await supabase.from("user_lesson_progress").upsert(
    {
      user_id: userId,
      sanity_lesson_id: lessonId,
      sanity_submodule_id: submoduleId,
      sanity_module_id: moduleId,
      progress_percent: progressPercent,
      is_completed: isCompleted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,sanity_lesson_id" },
  );
  if (error) throw error;
}

export async function toggleFavouriteModule(
  moduleId: string,
  isFavourite: boolean,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    // Env-not-configured: persist to the in-memory mock store instead.
    if (isFavourite) mockFavouriteModuleIds.add(moduleId);
    else mockFavouriteModuleIds.delete(moduleId);
    return;
  }
  const userId = await getAuthUserId();
  if (!userId) throw new Error("toggleFavouriteModule: no auth session");

  const supabase = createClient();
  if (isFavourite) {
    const { error } = await supabase
      .from("learn_favourites")
      .insert({ user_id: userId, sanity_module_id: moduleId });
    // (user_id, sanity_module_id) is the composite PK; duplicate = already
    // favourited, treat as idempotent success (matches community joinGroup).
    if (error && (error as { code?: string }).code !== "23505") throw error;
  } else {
    const { error } = await supabase
      .from("learn_favourites")
      .delete()
      .eq("user_id", userId)
      .eq("sanity_module_id", moduleId);
    if (error) throw error;
  }
}
