import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as highlights from "@/services/highlights";
import type { Highlight, SaveHighlightInput } from "@/services/highlights";

/** React Query hooks for lesson highlights (Supabase, own-row via RLS). */

const HIGHLIGHTS_KEY = ["highlights"] as const;

function pageKey(lessonId: string, page: string) {
  return [...HIGHLIGHTS_KEY, lessonId, page] as const;
}

/** Highlights for the current lesson page. */
export function usePageHighlights(lessonId: string, page: string) {
  return useQuery({
    queryKey: pageKey(lessonId, page),
    queryFn: () => highlights.getHighlightsForPage(lessonId, page),
    enabled: !!lessonId && !!page,
    staleTime: 5 * 60 * 1000,
  });
}

let optimisticCounter = 0;

/**
 * Save a highlight with an optimistic insert. Overlap-merging is reconciled
 * by the invalidation on settle (the server returns the merged row).
 */
export function useSaveHighlight(lessonId: string, page: string) {
  const queryClient = useQueryClient();
  const key = pageKey(lessonId, page);
  return useMutation<
    Highlight | null,
    Error,
    SaveHighlightInput,
    { previous: Highlight[] | undefined }
  >({
    mutationFn: (input) => highlights.saveHighlight(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Highlight[]>(key);
      const optimistic: Highlight = {
        id: `optimistic-${optimisticCounter++}`,
        lessonId: input.lessonId,
        pageKey: input.pageKey,
        blockKey: input.blockKey,
        startWordIndex: input.startWordIndex,
        endWordIndex: input.endWordIndex,
        selectedText: input.selectedText,
        createdAt: new Date().toISOString(),
        moduleId: input.navContext?.moduleId ?? null,
        submoduleId: input.navContext?.submoduleId ?? null,
        submoduleTitle: input.navContext?.submoduleTitle ?? null,
        pageNum: input.navContext?.pageNum ?? null,
      };
      queryClient.setQueryData<Highlight[]>(key, [
        ...(previous ?? []),
        optimistic,
      ]);
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/** Delete a highlight with an optimistic removal. */
export function useDeleteHighlight(lessonId: string, page: string) {
  const queryClient = useQueryClient();
  const key = pageKey(lessonId, page);
  return useMutation<
    void,
    Error,
    string,
    { previous: Highlight[] | undefined }
  >({
    mutationFn: (id) => highlights.deleteHighlight(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Highlight[]>(key);
      queryClient.setQueryData<Highlight[]>(
        key,
        (prev) => (prev ?? []).filter((h) => h.id !== id),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
