/**
 * The self-contained React Query plumbing hooks shared by the Resume Builder and
 * Cover Letter Generator. These eight hooks were byte-for-byte identical between
 * the two features (modulo the service module and the query-key prefix), and none
 * of them touch the inline-edit `editWriteChain` or the feature-specific payload
 * shape — so they extract cleanly with no leaky coupling.
 *
 * Deliberately NOT here (kept per-feature because they share the module-level
 * `editWriteChain` and/or read the payload directly): `useCreate*`, `useSend*`,
 * `useUpdate*Data`, plus the title derivation and the cover-letter `useSetResumeLink`.
 *
 * The per-feature file owns the query keys and passes them in, so both the shared
 * hooks and the bespoke ones key off the SAME objects.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ResumeJobPosting } from "@/types/resume";

/** Minimum a draft record must expose for these hooks' cache merges. */
interface DraftLike {
  id: string;
  title: string;
  updatedAt: string;
}

export interface DraftHooksConfig<TDraft extends DraftLike, TSummary> {
  service: {
    listDrafts: () => Promise<TSummary[]>;
    getDraft: (id: string) => Promise<TDraft | null>;
    getUsage: () => Promise<{ count: number; remaining: number }>;
    fetchJobPosting: (
      input: { url: string } | { text: string },
    ) => Promise<ResumeJobPosting>;
    setDraftJobPosting: (
      id: string,
      jobPosting: ResumeJobPosting | null,
    ) => Promise<TDraft>;
    deleteDraft: (id: string) => Promise<void>;
    renameDraft: (id: string, title: string) => Promise<TDraft>;
    duplicateDraft: (id: string, title: string) => Promise<TDraft>;
  };
  keys: {
    drafts: readonly unknown[];
    usage: readonly unknown[];
    draftKey: (id: string) => readonly unknown[];
  };
}

interface FetchJobPostingInput {
  draftId: string;
  /** A URL to fetch + extract server-side, or pasted description text. */
  source: { url: string } | { text: string };
}

interface RenameInput {
  id: string;
  title: string;
}

interface DuplicateInput {
  id: string;
  /** The localized "Copy of …" title, composed by the caller. */
  title: string;
}

export function createDraftHooks<TDraft extends DraftLike, TSummary>(
  config: DraftHooksConfig<TDraft, TSummary>,
) {
  const { service, keys } = config;

  function useDrafts() {
    return useQuery({ queryKey: keys.drafts, queryFn: service.listDrafts });
  }

  function useDraft(id: string | null) {
    return useQuery({
      queryKey: keys.draftKey(id ?? ""),
      queryFn: () => service.getDraft(id as string),
      enabled: !!id,
      // Guard the optimistic user bubble from an immediate refetch (mirrors
      // Companion's useConversationMessages staleTime).
      staleTime: 30_000,
    });
  }

  function useUsage() {
    return useQuery({ queryKey: keys.usage, queryFn: service.getUsage });
  }

  /**
   * Fetch + extract a target job posting (or accept pasted text) and attach it to
   * the draft. Errors (JobPostingError / the feature LimitError) propagate to the
   * caller for a specific, localized message.
   */
  function useFetchJobPosting() {
    const queryClient = useQueryClient();
    return useMutation<TDraft, Error, FetchJobPostingInput>({
      mutationFn: async ({ draftId, source }) => {
        const jobPosting = await service.fetchJobPosting(source);
        return service.setDraftJobPosting(draftId, jobPosting);
      },
      onSuccess: (draft) => {
        queryClient.setQueryData(keys.draftKey(draft.id), draft);
        queryClient.invalidateQueries({ queryKey: keys.drafts });
      },
    });
  }

  /** Remove the target job posting from a draft (leaves the payload + transcript). */
  function useClearJobPosting() {
    const queryClient = useQueryClient();
    return useMutation<TDraft, Error, string>({
      mutationFn: (draftId) => service.setDraftJobPosting(draftId, null),
      onSuccess: (draft) => {
        queryClient.setQueryData(keys.draftKey(draft.id), draft);
        queryClient.invalidateQueries({ queryKey: keys.drafts });
      },
    });
  }

  function useDelete() {
    const queryClient = useQueryClient();
    return useMutation<void, Error, string>({
      mutationFn: (id) => service.deleteDraft(id),
      onSuccess: (_data, id) => {
        queryClient.removeQueries({ queryKey: keys.draftKey(id) });
        queryClient.invalidateQueries({ queryKey: keys.drafts });
      },
    });
  }

  /** Rename a draft (title only). Doesn't touch the payload, so it stays out of
   *  the inline-edit editWriteChain. */
  function useRename() {
    const queryClient = useQueryClient();
    return useMutation<TDraft, Error, RenameInput>({
      mutationFn: ({ id, title }) => service.renameDraft(id, title),
      onSuccess: (draft) => {
        queryClient.setQueryData<TDraft>(keys.draftKey(draft.id), (prev) =>
          prev
            ? { ...prev, title: draft.title, updatedAt: draft.updatedAt }
            : draft,
        );
        queryClient.invalidateQueries({ queryKey: keys.drafts });
      },
    });
  }

  /** Duplicate a draft into a new independent row; returns the new draft so the
   *  caller can navigate to it. */
  function useDuplicate() {
    const queryClient = useQueryClient();
    return useMutation<TDraft, Error, DuplicateInput>({
      mutationFn: ({ id, title }) => service.duplicateDraft(id, title),
      onSuccess: (draft) => {
        queryClient.setQueryData(keys.draftKey(draft.id), draft);
        queryClient.invalidateQueries({ queryKey: keys.drafts });
      },
    });
  }

  return {
    useDrafts,
    useDraft,
    useUsage,
    useFetchJobPosting,
    useClearJobPosting,
    useDelete,
    useRename,
    useDuplicate,
  };
}
