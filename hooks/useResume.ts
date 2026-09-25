import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import * as resume from "@/services/resume";
import { createDraftHooks } from "@/hooks/drafts/createDraftHooks";
import { buildProfile, nowIso } from "@/lib/drafts/profile";
import type { ResumeUpdater } from "@/lib/resume/editOps";
import { CURRENT_USER_KEY } from "@/hooks/useProfile";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/config";
import { DocumentImportError } from "@/lib/documents/errors";
import { RESUME_DAILY_MESSAGE_LIMIT } from "@/lib/resume/schema";
import { trackResumeCreated } from "@/lib/analytics";
import type { UserProfile } from "@/types";
import type {
  ResumeChatMessage,
  ResumeData,
  ResumeDraft,
  ResumeDraftSummary,
} from "@/types/resume";

/** React Query hooks for the AI Resume Builder (local persistence). Mirrors the
 *  Companion hook shape: stable keys, optimistic send, onSuccess invalidation.
 *  The self-contained plumbing hooks come from the shared `createDraftHooks`
 *  factory; the chat-send, create, inline-edit, and title logic stay here. */

const DRAFTS_KEY = ["resume-drafts"] as const;
const USAGE_KEY = ["resume-usage"] as const;

export function draftKey(id: string) {
  return ["resume-draft", id] as const;
}

/* ---- Shared plumbing hooks (see hooks/drafts/createDraftHooks). ---- */
const hooks = createDraftHooks<ResumeDraft, ResumeDraftSummary>({
  service: {
    listDrafts: resume.listDrafts,
    getDraft: resume.getDraft,
    getUsage: resume.getResumeUsage,
    fetchJobPosting: resume.fetchJobPosting,
    setDraftJobPosting: resume.setDraftJobPosting,
    deleteDraft: resume.deleteDraft,
    renameDraft: resume.renameDraft,
    duplicateDraft: resume.duplicateDraft,
  },
  keys: { drafts: DRAFTS_KEY, usage: USAGE_KEY, draftKey },
  analytics: {
    feature: "resume_builder",
    promptLimit: RESUME_DAILY_MESSAGE_LIMIT,
    isLimitError: (err) =>
      err instanceof resume.ResumeLimitError ||
      (err instanceof DocumentImportError && err.code === "daily_limit_reached"),
  },
});

export const useResumeDrafts = hooks.useDrafts;
export const useResumeDraft = hooks.useDraft;
export const useResumeUsage = hooks.useUsage;
/** Fetch + attach a target job posting (the editor then offers "Tailor my resume"). */
export const useFetchJobPosting = hooks.useFetchJobPosting;
export const useClearJobPosting = hooks.useClearJobPosting;
export const useDeleteResumeDraft = hooks.useDelete;
export const useRenameDraft = hooks.useRename;
export const useDuplicateDraft = hooks.useDuplicate;

/* ================================================================== *
 * Feature-specific hooks (create, send, inline-edit, title derivation).
 * ================================================================== */

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
      trackResumeCreated({ method: "scratch" });
    },
  });
}

/** The two visible stages of an import, for a two-step progress indicator. */
export type ImportPhase = "extracting" | "mapping";

/**
 * Import an existing resume from an uploaded PDF/DOCX: extract its text
 * (/api/documents/extract), map it to structured `ResumeData` in one AI turn
 * (resume-chat's import branch, which charges one message), then create a draft
 * seeded with the mapped resume + an assistant opener = the turn's reply. The
 * caller navigates to the new draft (with `?imported=1`) on success, mirroring
 * `handleCreate`; `onPhase` drives the progress UI. Errors surface as
 * `DocumentImportError` for the UI to map.
 */
export function useImportResumeDraft() {
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  return useMutation<
    ResumeDraft,
    Error,
    { file: File; onPhase?: (phase: ImportPhase) => void }
  >({
    mutationFn: async ({ file, onPhase }) => {
      onPhase?.("extracting");
      const { text } = await resume.extractDocumentText(file);
      const user = queryClient.getQueryData<UserProfile>(CURRENT_USER_KEY);
      const profile = buildProfile(user, i18n.language);
      onPhase?.("mapping");
      const response = await resume.generateImportTurn({
        importText: text,
        profile,
      });
      // Charged now — report before the save so a failed save can't drop it.
      hooks.reportPromptSent("import");
      const opener: ResumeChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response.reply,
        suggestions: response.suggestions,
        createdAt: nowIso(),
      };
      const title = deriveTitle(response.resume, user, t("resume.untitled"));
      const draft = resume.newDraft({ title, contact: {}, openerMessage: opener });
      const imported: ResumeDraft = {
        ...draft,
        resume: response.resume,
        complete: response.complete,
      };
      return resume.saveDraft(imported);
    },
    onSuccess: (draft) => {
      queryClient.setQueryData(draftKey(draft.id), draft);
      queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
      // The mapping turn consumed a message — refresh the quota meter.
      queryClient.invalidateQueries({ queryKey: USAGE_KEY });
      trackResumeCreated({ method: "file_import" });
    },
    onError: (err) => hooks.reportLimitReached(err, "import"),
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
 *
 * `placeholders` is EVERY supported locale's default (not just the current one):
 * a job-less draft stores its default in whatever locale was active at creation,
 * so if the user later switches language the current-locale placeholder wouldn't
 * match — and an auto title would be misread as a manual rename, permanently
 * stuck on the generic default instead of upgrading to the job title. Matching
 * any locale's default keeps the detection locale-robust. (Only the job-less
 * fallback is locale-dependent; a job-based title is derived from resume data.)
 */
function isAutoTitle(
  title: string,
  resumeData: ResumeData,
  user: UserProfile | undefined,
  placeholders: string[],
): boolean {
  return placeholders.some((p) => title === deriveTitle(resumeData, user, p));
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
  /** Shown as the user's chat bubble. */
  text: string;
  /**
   * What's actually sent to the model (defaults to `text`). Used by the "Tailor
   * my resume" action so the chat shows a short friendly bubble while the model
   * receives the full framed job-posting prompt.
   */
  modelPrompt?: string;
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
      mutationFn: async ({ draftId, text, modelPrompt }) => {
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
          message: modelPrompt ?? text,
          currentResume: draft.resume,
          profile,
          traceId: draftId,
        });
        // Charged now — report before the save so a failed save can't drop it.
        hooks.reportPromptSent("chat");

        const assistantMessage: ResumeChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response.reply,
          suggestions: response.suggestions,
          createdAt: nowIso(),
        };
        // The creation-default titles (mirror useCreateResumeDraft) used to tell
        // an auto-managed title from a manual rename — computed for EVERY supported
        // locale, since a job-less draft's default is stored in whatever locale was
        // active at creation and the user may have switched language since.
        const name = user?.onboarding?.firstName?.trim();
        const placeholders = Object.keys(SUPPORTED_LANGUAGES).map((lng) =>
          name
            ? t("resume.draftTitleNamed", { name, lng })
            : t("resume.untitled", { lng }),
        );
        // Use the LATEST known title, not the pre-turn snapshot's: a rename may
        // have landed (via the My Resumes list) while this turn was generating,
        // and we must not overwrite it.
        const latestTitle =
          queryClient.getQueryData<ResumeDraft>(draftKey(draftId))?.title ??
          draft.title;
        const finalDraft: ResumeDraft = {
          ...withUser,
          messages: [...withUser.messages, assistantMessage],
          // The model never authors the job-posting target and the edge fn strips
          // unknown fields, so re-merge the persisted target back onto its snapshot.
          resume: draft.resume.jobPosting
            ? { ...response.resume, jobPosting: draft.resume.jobPosting }
            : response.resume,
          complete: response.complete,
          // Only auto-retitle if the user hasn't renamed this draft.
          title: isAutoTitle(latestTitle, draft.resume, user, placeholders)
            ? deriveTitle(response.resume, user, latestTitle)
            : latestTitle,
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
      onError: (err, _vars, context) => {
        // The user turn was persisted; reconverge the cache to the stored state
        // (keeps their message, drops the failed assistant turn).
        if (context) queryClient.invalidateQueries({ queryKey: context.key });
        hooks.reportLimitReached(err, "chat");
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
