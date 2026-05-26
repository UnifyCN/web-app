import type { ChecklistTask, Persona, Priority, Stage } from "@/types";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { sanityClient } from "@/lib/sanity";
import { tasks as mockTasks } from "@/lib/mock/tasks";

/**
 * Checklist data access. Content comes from Sanity (filtered by the user's
 * persona + stage); per-user progress comes from Supabase. Pattern mirrors
 * the mobile app: only INSERT into `user_tasks` when the user marks an item
 * complete — Sanity items with no row are uncompleted by default.
 */

const CLASS_TO_PRIORITY: Record<string, Priority> = {
  do_now: "Do now",
  do_soon: "Do soon",
  explore_and_connect: "Explore and connect",
  optional_later: "Optional / later",
};

const STAGE_TO_SLUG: Record<Stage, string> = {
  0: "not_arrived",
  1: "arrived_0_3_months",
  2: "months_3_12",
  3: "years_1_3",
  4: "years_3_plus",
};

const PRIORITY_ORDER: Priority[] = [
  "Do now",
  "Do soon",
  "Explore and connect",
  "Optional / later",
];

const CHECKLIST_GROQ = `*[
  _type == "checklist"
  && $persona in personas
  && stage == $stage
] | order(class asc, class_order asc) {
  _id,
  title,
  description,
  longer_description,
  class,
  class_order,
  link_tab
}`;

interface SanityChecklistItem {
  _id: string;
  title: string;
  description: string | null;
  longer_description: string | null;
  class: string;
  class_order: number;
  link_tab: string | null;
}

async function getChecklistByPersonaAndStage(
  persona: Persona,
  stageSlug: string,
): Promise<SanityChecklistItem[]> {
  try {
    const result = await sanityClient.fetch<SanityChecklistItem[]>(
      CHECKLIST_GROQ,
      { persona, stage: stageSlug },
    );
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error("Sanity checklist fetch failed", error);
    return [];
  }
}

function sortByPriority(tasks: ChecklistTask[]): ChecklistTask[] {
  const index = new Map(PRIORITY_ORDER.map((p, i) => [p, i]));
  return [...tasks].sort(
    (a, b) =>
      (index.get(a.priority) ?? 99) - (index.get(b.priority) ?? 99),
  );
}

export async function getTasks(): Promise<ChecklistTask[]> {
  if (!isSupabaseConfigured()) return mockTasks;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return mockTasks;

  const { data: onboarding } = await supabase
    .from("user_onboarding_profiles")
    .select("persona, stage")
    .eq("id", user.id)
    .maybeSingle();

  // No onboarding row yet → persona/stage filtering can't run. Show mock so
  // the page stays browsable instead of rendering empty.
  if (!onboarding) return mockTasks;

  const persona = onboarding.persona as Persona;
  const stageSlug = STAGE_TO_SLUG[onboarding.stage as Stage];

  const [items, userTasksRes, customRes] = await Promise.all([
    getChecklistByPersonaAndStage(persona, stageSlug),
    supabase
      .from("user_tasks")
      .select("sanity_checklist_id, completed, completed_at")
      .eq("user_id", user.id),
    supabase
      .from("custom_checklist_tasks")
      .select("id, priority, title, description, completed, completed_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
  ]);

  // Sanity errors are swallowed inside getChecklistByPersonaAndStage so a CMS
  // outage doesn't blank out the user's saved progress. Supabase errors must
  // bubble up — React Query surfaces them via useTasks().error.
  if (userTasksRes.error) throw userTasksRes.error;
  if (customRes.error) throw customRes.error;

  const userRowBySanityId = new Map<
    string,
    { completed: boolean; completed_at: string | null }
  >();
  (userTasksRes.data ?? []).forEach((row) => {
    if (row.sanity_checklist_id) {
      userRowBySanityId.set(row.sanity_checklist_id, {
        completed: row.completed,
        completed_at: row.completed_at,
      });
    }
  });

  const sanityTasks: ChecklistTask[] = items.map((item) => {
    const row = userRowBySanityId.get(item._id);
    return {
      id: item._id,
      priority: CLASS_TO_PRIORITY[item.class] ?? "Optional / later",
      title: item.title,
      description: item.longer_description || item.description || "",
      completed: row?.completed ?? false,
      completedAt: row?.completed_at ?? null,
      isCustom: false,
    };
  });

  const customTasks: ChecklistTask[] = (customRes.data ?? []).map((row) => ({
    id: row.id,
    priority: row.priority as Priority,
    title: row.title,
    description: row.description ?? "",
    completed: row.completed,
    completedAt: row.completed_at,
    isCustom: true,
  }));

  return sortByPriority([...sanityTasks, ...customTasks]);
}

export async function getCustomTasks(): Promise<ChecklistTask[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("custom_checklist_tasks")
    .select("id, priority, title, description, completed, completed_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getCustomTasks failed", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    priority: row.priority as Priority,
    title: row.title,
    description: row.description ?? "",
    completed: row.completed,
    completedAt: row.completed_at,
    isCustom: true,
  }));
}

export interface ToggleTaskInput {
  id: string;
  isCustom: boolean;
  /** Current completed state — the toggle flips it. */
  completed: boolean;
}

export async function toggleTask(input: ToggleTaskInput): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("toggleTask: no auth session");

  const nextCompleted = !input.completed;
  const nextCompletedAt = nextCompleted ? new Date().toISOString() : null;

  if (input.isCustom) {
    const { error } = await supabase
      .from("custom_checklist_tasks")
      .update({ completed: nextCompleted, completed_at: nextCompletedAt })
      .eq("id", input.id)
      .eq("user_id", user.id);
    if (error) throw error;
    return;
  }

  if (input.completed) {
    // Going completed → uncompleted: row already exists, UPDATE it.
    const { error } = await supabase
      .from("user_tasks")
      .update({ completed: false, completed_at: null })
      .eq("user_id", user.id)
      .eq("sanity_checklist_id", input.id);
    if (error) throw error;
    return;
  }

  // Going uncompleted → completed. Upsert handles both first-time complete
  // (no row) and re-complete after an uncomplete (row exists with
  // completed=false). The UNIQUE (user_id, sanity_checklist_id) constraint
  // is what onConflict targets.
  const { error } = await supabase.from("user_tasks").upsert(
    {
      user_id: user.id,
      sanity_checklist_id: input.id,
      completed: true,
      completed_at: nextCompletedAt,
    },
    { onConflict: "user_id,sanity_checklist_id" },
  );
  if (error) throw error;
}

export interface CustomTaskInput {
  title: string;
  description: string;
  priority: Priority;
}

export async function addCustomTask(input: CustomTaskInput): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("addCustomTask: no auth session");

  const { error } = await supabase.from("custom_checklist_tasks").insert({
    user_id: user.id,
    priority: input.priority,
    title: input.title,
    description: input.description || null,
  });
  if (error) throw error;
}
