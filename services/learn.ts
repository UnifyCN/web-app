import type {
  LearningProgressSummary,
  LearnModuleView,
  LessonProgress,
  ModuleStatus,
  PracticeProgress,
  SanityLesson,
  SanityModule,
  SanityPractice,
} from "@/types";
import {
  createClient,
  getAuthUserId,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import {
  isSanityConfigured,
  sanityClient,
  MODULES_LIST_QUERY,
  MODULE_DETAIL_QUERY,
  LESSON_DETAIL_QUERY,
  PRACTICES_BY_SUBMODULE_QUERY,
} from "@/lib/sanity";
import {
  getMockLessonById,
  getMockModuleById,
  mockModules,
} from "@/lib/mock/modules";
import { getMockPracticesBySubmodule } from "@/lib/mock/practices";
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
    progressPercent: row.progress_percent,
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

export async function getModules(): Promise<LearnModuleView[]> {
  if (!isSanityConfigured()) return mockModules;

  const sanityModules = await sanityClient.fetch<SanityModule[]>(
    MODULES_LIST_QUERY,
  );

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
): Promise<LearnModuleView | undefined> {
  if (!isSanityConfigured()) return getMockModuleById(moduleId);

  const sanityModule = await sanityClient.fetch<SanityModule | null>(
    MODULE_DETAIL_QUERY,
    { moduleId },
  );
  if (!sanityModule) return undefined;

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
): Promise<SanityLesson | undefined> {
  if (!isSanityConfigured()) return getMockLessonById(lessonId);

  const lesson = await sanityClient.fetch<SanityLesson | null>(
    LESSON_DETAIL_QUERY,
    { lessonId },
  );
  return lesson ?? undefined;
}

/* ---- Practices (quiz content) ---------------------------------------- */

/**
 * The quiz-type practices for a submodule, ordered by `order_number`. Activity
 * practices are filtered out — the web only renders the quiz flow today.
 */
export async function getPractices(
  submoduleId: string,
): Promise<SanityPractice[]> {
  if (!isSanityConfigured()) return getMockPracticesBySubmodule(submoduleId);

  const practices = await sanityClient.fetch<SanityPractice[]>(
    PRACTICES_BY_SUBMODULE_QUERY,
    { submoduleId },
  );
  return (practices ?? [])
    .filter((p) => p.practice_type === "quiz")
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
    .from("user_practice_progress")
    .select(
      "sanity_submodule_id, current_question_index, current_submitted, answers, is_completed, score, total_questions, updated_at",
    )
    .eq("user_id", userId)
    .eq("sanity_submodule_id", submoduleId)
    .maybeSingle();
  if (error) throw error;

  return data ? rowToPracticeProgress(data as PracticeProgressRow) : null;
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
  const { error } = await supabase.from("user_practice_progress").upsert(
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

/* ---- Home right-panel summary ----------------------------------------- */

export async function getLearningProgressSummary(): Promise<
  LearningProgressSummary[]
> {
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
  const [sanityModules, lessonsRes] = await Promise.all([
    sanityClient.fetch<
      (Pick<SanityModule, "_id" | "title" | "colorTheme"> & {
        lessonIds?: string[];
      })[]
    >(
      `*[_type == "module" && _id in $ids]{
        _id, title, colorTheme { hex },
        "lessonIds": *[_type == "submodule" && references(^._id)][]{
          "ids": *[_type == "lesson" && references(^._id)]._id
        }.ids[]
      }`,
      { ids: moduleIds },
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
  const sanityById = new Map(sanityModules.map((m) => [m._id, m]));

  // Preserve learn_progress ordering (most-recently-updated first).
  return rows
    .map((r) => {
      const mod = sanityById.get(r.module_id);
      if (!mod) return null;
      return {
        moduleId: mod._id,
        moduleName: mod.title,
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
  progressPercent: number,
  isCompleted: boolean,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const userId = await getAuthUserId();
  if (!userId) throw new Error("setLessonProgress: no auth session");

  const supabase = createClient();
  const { error } = await supabase.from("user_lesson_progress").upsert(
    {
      user_id: userId,
      sanity_lesson_id: lessonId,
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
  if (!isSupabaseConfigured()) return;
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
