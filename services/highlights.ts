import {
  createClient,
  getAuthUserId,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

/**
 * Lesson highlight persistence. Mirrors the mobile `highlightService` against
 * the same (now mobile-parity) `lesson_highlights` schema so rows are
 * merge-compatible: word-range highlights scoped to a lesson page + block, with
 * an overlap-merge path via the `merge_highlights` RPC. Follows the Community
 * pattern (isSupabaseConfigured + getAuthUserId guards, snake_case row mapper,
 * graceful empty/mock fallback when env vars aren't set).
 */

export interface Highlight {
  id: string;
  lessonId: string;
  pageKey: string;
  blockKey: string;
  startWordIndex: number;
  endWordIndex: number;
  selectedText: string;
  createdAt: string;
  moduleId: string | null;
  submoduleId: string | null;
  submoduleTitle: string | null;
  pageNum: number | null;
}

export interface HighlightNavContext {
  moduleId: string;
  submoduleId: string;
  submoduleTitle: string;
  pageNum: number;
}

interface HighlightRow {
  id: string;
  lesson_id: string;
  page_key: string;
  block_key: string;
  start_word_index: number;
  end_word_index: number;
  selected_text: string;
  created_at: string;
  module_id: string | null;
  submodule_id: string | null;
  submodule_title: string | null;
  page_num: number | null;
}

function rowToHighlight(row: HighlightRow): Highlight {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    pageKey: row.page_key,
    blockKey: row.block_key,
    startWordIndex: row.start_word_index,
    endWordIndex: row.end_word_index,
    selectedText: row.selected_text,
    createdAt: row.created_at,
    moduleId: row.module_id,
    submoduleId: row.submodule_id,
    submoduleTitle: row.submodule_title,
    pageNum: row.page_num,
  };
}

/** All highlights for one lesson page (own-row via RLS), oldest first. */
export async function getHighlightsForPage(
  lessonId: string,
  pageKey: string,
): Promise<Highlight[]> {
  if (!isSupabaseConfigured()) return [];
  const userId = await getAuthUserId();
  if (!userId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("lesson_highlights")
    .select(
      "id, lesson_id, page_key, block_key, start_word_index, end_word_index, selected_text, created_at, module_id, submodule_id, submodule_title, page_num",
    )
    .eq("user_id", userId)
    .eq("lesson_id", lessonId)
    .eq("page_key", pageKey)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as HighlightRow[]).map(rowToHighlight);
}

export interface SaveHighlightInput {
  lessonId: string;
  pageKey: string;
  blockKey: string;
  startWordIndex: number;
  endWordIndex: number;
  selectedText: string;
  /** Current highlights for the page (to detect same-block overlaps). */
  existingHighlights: Highlight[];
  /** All words in the block — used to rebuild merged text on overlap. */
  allWordsInBlock: string[];
  navContext?: HighlightNavContext;
}

/**
 * Save a highlight. If the new range overlaps existing highlights in the same
 * block, they're merged into one continuous range via the atomic
 * `merge_highlights` RPC; otherwise it's a plain insert.
 */
export async function saveHighlight(
  input: SaveHighlightInput,
): Promise<Highlight | null> {
  if (!isSupabaseConfigured()) return null;
  const userId = await getAuthUserId();
  if (!userId) return null;

  const supabase = createClient();
  const {
    lessonId,
    pageKey,
    blockKey,
    startWordIndex,
    endWordIndex,
    selectedText,
    existingHighlights,
    allWordsInBlock,
    navContext,
  } = input;

  // No words to anchor to — bail rather than persist an empty highlight with a
  // collapsed [0,0] range.
  if (allWordsInBlock.length === 0) return null;

  // Ignore optimistic (non-persisted) entries when checking overlaps.
  const realHighlights = existingHighlights.filter(
    (h) => !h.id.startsWith("optimistic-"),
  );
  const overlapping = realHighlights.filter(
    (h) =>
      h.blockKey === blockKey &&
      h.startWordIndex <= endWordIndex &&
      h.endWordIndex >= startWordIndex,
  );

  if (overlapping.length > 0) {
    const mergedStart = Math.min(
      startWordIndex,
      ...overlapping.map((h) => h.startWordIndex),
    );
    const mergedEnd = Math.max(
      endWordIndex,
      ...overlapping.map((h) => h.endWordIndex),
    );
    const clampedStart = Math.max(
      0,
      Math.min(mergedStart, allWordsInBlock.length - 1),
    );
    const clampedEnd = Math.max(
      clampedStart,
      Math.min(mergedEnd, allWordsInBlock.length - 1),
    );
    const mergedText = allWordsInBlock
      .slice(clampedStart, clampedEnd + 1)
      .join(" ");

    const { data, error } = await supabase.rpc("merge_highlights", {
      p_ids_to_delete: overlapping.map((h) => h.id),
      p_lesson_id: lessonId,
      p_page_key: pageKey,
      p_block_key: blockKey,
      p_start_word_index: clampedStart,
      p_end_word_index: clampedEnd,
      p_selected_text: mergedText,
      p_module_id: navContext?.moduleId ?? null,
      p_submodule_id: navContext?.submoduleId ?? null,
      p_submodule_title: navContext?.submoduleTitle ?? null,
      p_page_num: navContext?.pageNum ?? null,
    });
    if (error) throw error;
    return rowToHighlight(data as HighlightRow);
  }

  // No overlap — simple insert.
  const { data, error } = await supabase
    .from("lesson_highlights")
    .insert({
      user_id: userId,
      lesson_id: lessonId,
      page_key: pageKey,
      block_key: blockKey,
      start_word_index: startWordIndex,
      end_word_index: endWordIndex,
      selected_text: selectedText,
      module_id: navContext?.moduleId ?? null,
      submodule_id: navContext?.submoduleId ?? null,
      submodule_title: navContext?.submoduleTitle ?? null,
      page_num: navContext?.pageNum ?? null,
    })
    .select(
      "id, lesson_id, page_key, block_key, start_word_index, end_word_index, selected_text, created_at, module_id, submodule_id, submodule_title, page_num",
    )
    .single();
  if (error) throw error;
  return rowToHighlight(data as HighlightRow);
}

/** Delete a highlight by id (own-row via RLS). */
export async function deleteHighlight(highlightId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const userId = await getAuthUserId();
  if (!userId) return;

  const supabase = createClient();
  const { error } = await supabase
    .from("lesson_highlights")
    .delete()
    .eq("id", highlightId);
  if (error) throw error;
}

/* ---- Ask AI (explain-term edge function) ------------------------------ */

const MOCK_EXPLANATION =
  "This is a term newcomers to Canada often come across. In plain language, it " +
  "refers to a common part of settling in — like a document, program, or process " +
  "you'll use as you get established. (Connect Supabase to get a real AI explanation.)";

/**
 * Calls the `explain-term` edge function for a short, newcomer-friendly
 * explanation of the selected text. Falls back to a canned reply when Supabase
 * isn't configured (local dev) so the UI can be exercised without the backend.
 */
export async function explainTerm(
  term: string,
  lessonContext?: string,
): Promise<{ explanation: string }> {
  if (!isSupabaseConfigured()) {
    return { explanation: MOCK_EXPLANATION };
  }

  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke<{
    explanation: string;
  }>("explain-term", {
    body: { term, lessonContext },
  });

  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      let errBody: { error?: string } = {};
      try {
        errBody = await ctx.json();
      } catch {
        // non-JSON error body — fall through to the generic message
      }
      throw new Error(errBody?.error ?? `explain-term failed (${ctx.status})`);
    }
    throw error;
  }

  if (!data || typeof data.explanation !== "string") {
    throw new Error("explain-term returned no explanation");
  }
  return { explanation: data.explanation };
}
