import type {
  LearningProgressSummary,
  LearnModuleView,
  LessonProgress,
  ModuleStatus,
  SanityLesson,
  SanityModule,
} from "@/types";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  isSanityConfigured,
  sanityClient,
  MODULES_LIST_QUERY,
  MODULE_DETAIL_QUERY,
  LESSON_DETAIL_QUERY,
} from "@/lib/sanity";
import {
  getMockLessonById,
  getMockModuleById,
  mockModules,
} from "@/lib/mock/modules";
import { mockLearningProgress } from "@/lib/mock/progress";

/**
 * Learn data access. Sanity owns module/submodule/lesson content; Supabase
 * owns per-user progress (`learn_progress`, `user_lesson_progress`) and
 * favourites (`learn_favourites`). Each function guards with the relevant
 * configured + auth checks and falls back to mock data when env vars
 * aren't set (matches the Community/Companion pattern).
 */

/* ---- Helpers ---------------------------------------------------------- */

async function getAuthUserId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

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

/** Cosmetic percent for the list view; detail view computes the real value. */
function percentForStatus(status: ModuleStatus): number {
  if (status === "completed") return 100;
  if (status === "in_progress") return 50;
  return 0;
}

/* ---- Modules ---------------------------------------------------------- */

export async function getModules(): Promise<LearnModuleView[]> {
  if (!isSanityConfigured()) return mockModules;

  const sanityModules = await sanityClient.fetch<SanityModule[]>(
    MODULES_LIST_QUERY,
  );

  // Per-user merge: only when Supabase is configured AND the caller is
  // signed in. Otherwise return the Sanity modules with default state.
  let progressByModuleId: Record<string, LearnProgressRow> = {};
  let favouriteIds = new Set<string>();

  if (isSupabaseConfigured()) {
    const userId = await getAuthUserId();
    if (userId) {
      const supabase = createClient();
      const [progressRes, favRes] = await Promise.all([
        supabase
          .from("learn_progress")
          .select("module_id, status, completed_at, updated_at")
          .eq("user_id", userId),
        supabase
          .from("learn_favourites")
          .select("sanity_module_id")
          .eq("user_id", userId),
      ]);
      if (progressRes.error) throw progressRes.error;
      if (favRes.error) throw favRes.error;

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
    }
  }

  return sanityModules.map((mod) => {
    const progress = progressByModuleId[mod._id];
    const status: ModuleStatus = progress?.status ?? "not_started";
    return {
      ...mod,
      status,
      progressPercent: percentForStatus(status),
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

/* ---- Home right-panel summary ----------------------------------------- */

export async function getLearningProgressSummary(): Promise<
  LearningProgressSummary[]
> {
  if (!isSupabaseConfigured() || !isSanityConfigured()) {
    return mockLearningProgress;
  }
  const userId = await getAuthUserId();
  if (!userId) return mockLearningProgress;

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

  const moduleIds = rows.map((r) => r.module_id);
  const sanityModules = await sanityClient.fetch<
    Pick<SanityModule, "_id" | "title" | "colorTheme">[]
  >(
    `*[_type == "module" && _id in $ids]{
      _id, title, colorTheme { hex }
    }`,
    { ids: moduleIds },
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
        progressPercent: percentForStatus("in_progress"),
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
