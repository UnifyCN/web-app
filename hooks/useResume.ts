import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import * as resume from "@/services/resume";
import type { ResumeUpdater } from "@/lib/resume/editOps";
import { CURRENT_USER_KEY } from "@/hooks/useProfile";
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  type SupportedLanguage,
} from "@/lib/i18n/config";
import type { UserProfile } from "@/types";
import type {
  ResumeChatMessage,
  ResumeData,
  ResumeDraft,
  ResumeProfileContext,
} from "@/types/resume";

/** React Query hooks for the AI Resume Builder (local persistence). Mirrors the
 *  Companion hook shape: stable keys, optimistic send, onSuccess invalidation. */

const DRAFTS_KEY = ["resume-drafts"] as const;
const USAGE_KEY = ["resume-usage"] as const;

export function draftKey(id: string) {
  return ["resume-draft", id] as const;
}

function resolveLanguage(lang: string): SupportedLanguage {
  return isSupportedLanguage(lang) ? lang : DEFAULT_LANGUAGE;
}

/** Build the per-turn personalization context from the cached current user. */
function buildProfile(
  user: UserProfile | undefined,
  language: string,
): ResumeProfileContext {
  const onb = user?.onboarding ?? null;
  return {
    firstName: onb?.firstName ?? null,
    persona: onb?.persona ?? null,
    stage: onb?.stage ?? null,
    city: onb?.city ?? null,
    province: onb?.province ?? null,
    email: null,
    responseLanguage: resolveLanguage(language),
  };
}

function nowIso() {
  return new Date().toISOString();
}

export function useResumeDrafts() {
  return useQuery({ queryKey: DRAFTS_KEY, queryFn: resume.listDrafts });
}

export function useResumeDraft(id: string | null) {
  return useQuery({
    queryKey: draftKey(id ?? ""),
    queryFn: () => resume.getDraft(id as string),
    enabled: !!id,
    // Guard the optimistic user bubble from an immediate refetch (mirrors
    // Companion's useConversationMessages staleTime).
    staleTime: 30_000,
  });
}

export function useResumeUsage() {
  return useQuery({ queryKey: USAGE_KEY, queryFn: resume.getResumeUsage });
}

/**
 * Create a new draft: prefill contact from the onboarding profile (name +
 * city/province) and seed a localized opening message + example-answer chips,
 * so the empty state is warm and instant with no model call.
 */
export function useCreateResumeDraft() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async () => {
      const user = queryClient.getQueryData<UserProfile>(CURRENT_USER_KEY);
      const onb = user?.onboarding ?? null;
      const name = onb?.firstName?.trim() ?? "";
      const location = [onb?.city, onb?.province].filter(Boolean).join(", ");
      const opener: ResumeChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: name
          ? t("resume.opener.greetingNamed", { name })
          : t("resume.opener.greeting"),
        suggestions: [
          t("resume.opener.suggestion1"),
          t("resume.opener.suggestion2"),
          t("resume.opener.suggestion3"),
        ],
        createdAt: nowIso(),
      };
      const title = name
        ? t("resume.draftTitleNamed", { name })
        : t("resume.untitled");
      const draft = resume.newDraft({
        title,
        contact: { name, location },
        openerMessage: opener,
      });
      return resume.saveDraft(draft);
    },
    onSuccess: (draft) => {
      queryClient.setQueryData(draftKey(draft.id), draft);
      queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
    },
  });
}

/** A short human title derived from the resume so the drafts list stays scannable. */
function deriveTitle(
  data: ResumeData,
  user: UserProfile | undefined,
  fallback: string,
): string {
  const job = data.experience[0]?.title?.trim();
  const name = user?.onboarding?.firstName?.trim();
  if (job && name) return `${name} — ${job}`;
  if (job) return job;
  return fallback;
}

/**
 * True while a draft's title is still auto-managed (not manually renamed). It's
 * compared against the auto-title computed with the CREATION-DEFAULT placeholder
 * as the fallback — NOT the current title. That matters for a draft renamed
 * before it has any job: deriveTitle would otherwise fall back to the current
 * title and make every no-job title look "auto", clobbering the rename on the
 * next turn. Against the placeholder, a custom title diverges and is preserved.
 */
function isAutoTitle(
  draft: ResumeDraft,
  user: UserProfile | undefined,
  placeholder: string,
): boolean {
  return draft.title === deriveTitle(draft.resume, user, placeholder);
}

/**
 * Serializes inline-edit persistence across all mutation instances. Rapid
 * per-field commits fire one mutation each; without a barrier their async
 * localStorage read-modify-writes race and a late writer resurrects a stale
 * snapshot (wiping a just-added entry). Chaining the writes means each persists
 * the LIVE cache resume in order, so the final commit wins deterministically.
 * A send also awaits this chain so a manual edit made moments earlier is flushed
 * to storage before the AI turn reads `currentResume`.
 */
let editWriteChain: Promise<unknown> = Promise.resolve();

interface SendInput {
  draftId: string;
  text: string;
}

/**
 * Persist the user turn, ask DeepSeek (via /api/resume) for the structured next
 * turn, then persist the assistant reply + the updated resume snapshot.
 * Optimistically appends the user bubble; the user turn is saved BEFORE the
 * model call, so a failed generation keeps their message (they can continue).
 */
export function useSendResumeMessage() {
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  return useMutation<ResumeDraft, Error, SendInput, { key: ReturnType<typeof draftKey> }>(
    {
      mutationFn: async ({ draftId, text }) => {
        // Flush any in-flight inline-edit writes first, so a manual edit made
        // moments before hitting send is already in storage — otherwise this
        // turn would read a stale `currentResume` and overwrite that edit.
        await editWriteChain;
        // Read from the persisted store, NOT the query cache: onMutate has
        // already appended an optimistic user bubble to the cache, so reading
        // the cache here would double-count it into the saved draft.
        const draft = await resume.getDraft(draftId);
        if (!draft) throw new Error("Draft not found");

        const user = queryClient.getQueryData<UserProfile>(CURRENT_USER_KEY);
        const profile = buildProfile(user, i18n.language);

        const userMessage: ResumeChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          content: text,
          createdAt: nowIso(),
        };
        const withUser: ResumeDraft = {
          ...draft,
          messages: [...draft.messages, userMessage],
        };
        // Persist the user turn first so it survives a failed generation.
        await resume.saveDraft(withUser);
        queryClient.setQueryData(draftKey(draftId), withUser);

        const response = await resume.generateResumeTurn({
          history: draft.messages,
          message: text,
          currentResume: draft.resume,
          profile,
        });

        const assistantMessage: ResumeChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response.reply,
          suggestions: response.suggestions,
          createdAt: nowIso(),
        };
        // The creation-default title (mirrors useCreateResumeDraft), used to tell
        // an auto-managed title from a manual rename.
        const name = user?.onboarding?.firstName?.trim();
        const placeholder = name
          ? t("resume.draftTitleNamed", { name })
          : t("resume.untitled");
        const finalDraft: ResumeDraft = {
          ...withUser,
          messages: [...withUser.messages, assistantMessage],
          resume: response.resume,
          complete: response.complete,
          // Only auto-retitle if the user hasn't renamed this draft.
          title: isAutoTitle(draft, user, placeholder)
            ? deriveTitle(response.resume, user, draft.title)
            : draft.title,
        };
        return resume.saveDraft(finalDraft);
      },
      onMutate: async ({ draftId, text }) => {
        const key = draftKey(draftId);
        await queryClient.cancelQueries({ queryKey: key });
        const optimistic: ResumeChatMessage = {
          id: `optimistic-${Date.now()}`,
          role: "user",
          content: text,
          createdAt: nowIso(),
        };
        queryClient.setQueryData<ResumeDraft>(key, (prev) =>
          prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev,
        );
        return { key };
      },
      onError: (_err, _vars, context) => {
        // The user turn was persisted; reconverge the cache to the stored state
        // (keeps their message, drops the failed assistant turn).
        if (context) queryClient.invalidateQueries({ queryKey: context.key });
      },
      onSuccess: (finalDraft) => {
        queryClient.setQueryData(draftKey(finalDraft.id), finalDraft);
        queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
        queryClient.invalidateQueries({ queryKey: USAGE_KEY });
      },
    },
  );
}

interface UpdateResumeInput {
  draftId: string;
  /** A functional update, applied to the FRESHEST resume at commit time. */
  update: ResumeUpdater;
}

/**
 * Persist a manual inline edit to the draft's resume. Writes the SAME
 * `draft.resume` the AI turn reads/writes (localStorage + cache), so chat-driven
 * and manual edits stay in sync — a manual edit persisted here is what the next
 * AI turn receives as `currentResume` and is instructed to preserve.
 *
 * Correctness rests on two things: `onMutate` applies the updater to the cache
 * synchronously in call order (so the cache is always the fully-accumulated,
 * correct state), and the persistence is serialized + reads that live cache at
 * write time (so the last write commits the final state regardless of the order
 * the async mutations happen to resolve in).
 */
export function useUpdateResumeData() {
  const queryClient = useQueryClient();
  return useMutation<
    ResumeDraft,
    Error,
    UpdateResumeInput,
    { key: ReturnType<typeof draftKey> }
  >({
    mutationFn: ({ draftId }) => {
      const run = editWriteChain.then(() => {
        // Read the live cache at WRITE time (not a captured snapshot): onMutate
        // has already folded every prior edit into it in order.
        const cached = queryClient.getQueryData<ResumeDraft>(draftKey(draftId));
        if (!cached) throw new Error("Draft not found");
        // Inline edits don't retitle the draft — auto-titling is a coaching-turn
        // behavior, and explicit rename lives in the My Resumes list.
        return resume.saveDraftResume(draftId, cached.resume, cached.title);
      });
      // Keep the chain alive but isolated from this write's failure.
      editWriteChain = run.catch(() => {});
      return run;
    },
    onMutate: async ({ draftId, update }) => {
      const key = draftKey(draftId);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<ResumeDraft>(key, (prev) =>
        prev ? { ...prev, resume: update(prev.resume) } : prev,
      );
      return { key };
    },
    onError: (_err, _vars, context) => {
      // Re-sync from what actually persisted rather than rolling back to a
      // pre-edit snapshot, which could drop a concurrent successful edit.
      if (context?.key) {
        queryClient.invalidateQueries({ queryKey: context.key });
      }
    },
    onSuccess: (finalDraft) => {
      // Merge the derived title/timestamp but KEEP the cache's resume — it may
      // already hold a newer optimistic edit than this write's snapshot.
      queryClient.setQueryData<ResumeDraft>(draftKey(finalDraft.id), (prev) =>
        prev
          ? { ...prev, title: finalDraft.title, updatedAt: finalDraft.updatedAt }
          : finalDraft,
      );
      queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
    },
  });
}

export function useDeleteResumeDraft() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => resume.deleteDraft(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: draftKey(id) });
      queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
    },
  });
}

interface RenameInput {
  id: string;
  title: string;
}

/** Rename a draft (title only). Doesn't touch the resume body, so it stays out
 *  of the inline-edit `editWriteChain`. */
export function useRenameDraft() {
  const queryClient = useQueryClient();
  return useMutation<ResumeDraft, Error, RenameInput>({
    mutationFn: ({ id, title }) => resume.renameDraft(id, title),
    onSuccess: (draft) => {
      queryClient.setQueryData<ResumeDraft>(draftKey(draft.id), (prev) =>
        prev ? { ...prev, title: draft.title, updatedAt: draft.updatedAt } : draft,
      );
      queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
    },
  });
}

interface DuplicateInput {
  id: string;
  /** The localized "Copy of …" title, composed by the caller. */
  title: string;
}

/** Duplicate a draft into a new independent row; returns the new draft so the
 *  caller can navigate to it. */
export function useDuplicateDraft() {
  const queryClient = useQueryClient();
  return useMutation<ResumeDraft, Error, DuplicateInput>({
    mutationFn: ({ id, title }) => resume.duplicateDraft(id, title),
    onSuccess: (draft) => {
      queryClient.setQueryData(draftKey(draft.id), draft);
      queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
    },
  });
}
