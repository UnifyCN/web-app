import { isPostHogConfigured, posthog } from "@/lib/posthog";
import type { PartnerCategory, PartnershipType } from "@/types";
import type { TranslatableType } from "@/services/translations";

/**
 * Typed PostHog product-event helpers for the web app. Each function mirrors the
 * event name + property shape the mobile app already sends to the shared PostHog
 * project, so web and mobile insights line up (the `platform:'web'` super property
 * registered in `lib/posthog.ts` tags every capture — never set it here).
 *
 * All helpers no-op on the server and when PostHog isn't configured (local dev /
 * preview without analytics), mirroring the services-layer guard convention.
 */
function capture(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined" || !isPostHogConfigured()) return;
  // Tracking must never break a feature: most captures run inside mutation
  // callbacks, so a PostHog failure is logged and swallowed, never rethrown.
  try {
    posthog.capture(event, properties);
  } catch (err) {
    console.warn(`[analytics] capture "${event}" failed`, err);
  }
}

/* ---- Auth ------------------------------------------------------------- */

export const trackSignUpStarted = () => capture("sign_up_started");
export const trackSignUpCompleted = () => capture("sign_up_completed");
export const trackSignUpFailed = () => capture("sign_up_failed");
export const trackSignInCompleted = () => capture("sign_in_completed");
export const trackSignInFailed = () => capture("sign_in_failed");
export const trackGoogleSignInUsed = () => capture("google_sign_in_used");
// Apple sign-in isn't wired on web yet (the button is an unwired stub), so there
// is no `apple_sign_in_used` capture site until that lands.
export const trackUserSignedOut = () => capture("user_signed_out");

/* ---- Onboarding ------------------------------------------------------- */

export const trackOnboardingStepCompleted = (p: {
  stepName: string;
  stepNumber: number;
}) =>
  capture("onboarding_step_completed", {
    step_name: p.stepName,
    step_number: p.stepNumber,
  });

export const trackOnboardingCompleted = () => capture("onboarding_completed");

/* ---- Companion -------------------------------------------------------- */

export const trackCompanionMessageSent = (p: { messageLength: number }) =>
  capture("companion_message_sent", { message_length: p.messageLength });

/* ---- Resume builder + Cover letter ------------------------------------- */
// Product-usage events for the two AI generators (Savar's weekly-review ask).
// `*_started` fires on the explicit tailor/generate action; `*_generated` fires
// when that action's turn resolves — plain refinement chat turns don't count.

type GenerationSource = "job_posting" | "import";

export const trackResumeStarted = (p: { source: GenerationSource }) =>
  capture("resume_started", { source: p.source });

export const trackResumeGenerated = () => capture("resume_generated");

export const trackCoverLetterStarted = (p: { source: GenerationSource }) =>
  capture("cover_letter_started", { source: p.source });

export const trackCoverLetterGenerated = () => capture("cover_letter_generated");

// Funnel + quota events (PR: resume/cover-letter analytics). METADATA ONLY — never
// pass resume/letter/job text, names, emails, or full URLs. `feature` matches the
// `$ai_generation` value the edge functions already send, so insights join.

export type DocumentFeature = "resume_builder" | "cover_letter";
type CreateMethod = "scratch" | "file_import";

export const trackResumeCreated = (p: { method: CreateMethod }) =>
  capture("resume_created", { method: p.method });

export const trackCoverLetterCreated = (p: {
  method: CreateMethod;
  hasLinkedResume: boolean;
}) =>
  capture("cover_letter_created", {
    method: p.method,
    has_linked_resume: p.hasLinkedResume,
  });

/** Hostname only (no path/query, `www.` stripped) — never the full URL. */
export function jobSourceDomain(url: string): string | undefined {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return host.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

export const trackJobPostingImported = (p: {
  feature: DocumentFeature;
  status: "started" | "succeeded" | "failed";
  input: "url" | "paste";
  sourceDomain?: string;
  errorCode?: string;
}) =>
  capture("job_posting_imported", {
    feature: p.feature,
    status: p.status,
    input: p.input,
    ...(p.sourceDomain ? { source_domain: p.sourceDomain } : {}),
    ...(p.errorCode ? { error_code: p.errorCode } : {}),
  });

/** `pdf` = the print dialog was opened (the browser owns the actual save). */
export type ExportFormat = "pdf" | "docx";

export const trackResumeExported = (p: { format: ExportFormat }) =>
  capture("resume_exported", { format: p.format });

export const trackCoverLetterExported = (p: { format: ExportFormat }) =>
  capture("cover_letter_exported", { format: p.format });

/** One charged AI turn (chat or import). Only fired on success — failed turns
 *  are refunded server-side, so they don't consume the daily quota.
 *  `promptsUsed` is omitted (never faked) when the usage read failed. */
export const trackAiPromptSent = (p: {
  feature: DocumentFeature;
  mode: "chat" | "import";
  promptsUsed?: number;
  promptLimit: number;
}) =>
  capture("ai_prompt_sent", {
    feature: p.feature,
    mode: p.mode,
    ...(p.promptsUsed !== undefined ? { prompts_used: p.promptsUsed } : {}),
    prompt_limit: p.promptLimit,
  });

/** `exhausted` = a charged turn used the last prompt (the UI then blocks
 *  further sends, so this is the common case); `blocked` = the server rejected
 *  an attempt with a 429. */
export const trackAiPromptLimitReached = (p: {
  feature: DocumentFeature;
  promptLimit: number;
  trigger: "chat" | "import" | "job_import";
  reason: "exhausted" | "blocked";
}) =>
  capture("ai_prompt_limit_reached", {
    feature: p.feature,
    prompt_limit: p.promptLimit,
    trigger: p.trigger,
    reason: p.reason,
  });

/* ---- In-Lesson Help ---------------------------------------------------- */
// Event names shared with mobile (PRD R5); `platform:'web'` comes from the
// super property in lib/posthog.ts — never set it here.

export const trackHelpOpened = (p: { moduleId: string; lessonId: string }) =>
  capture("help_opened", { module_id: p.moduleId, lesson_id: p.lessonId });

export const trackHelpPathSelected = (p: {
  path: "ai" | "community";
  moduleId: string;
  lessonId: string;
}) =>
  capture("help_path_selected", {
    path: p.path,
    module_id: p.moduleId,
    lesson_id: p.lessonId,
  });

export const trackInLessonAiQuestionSent = (p: {
  moduleId: string;
  lessonId: string;
  messageLength: number;
}) =>
  capture("inlesson_ai_question_sent", {
    module_id: p.moduleId,
    lesson_id: p.lessonId,
    message_length: p.messageLength,
  });

export const trackDiscussionPostCreated = (p: {
  moduleId: string;
  submoduleId: string | null;
  lessonId: string | null;
  bodyLength: number;
}) =>
  capture("discussion_post_created", {
    module_id: p.moduleId,
    submodule_id: p.submoduleId,
    lesson_id: p.lessonId,
    body_length: p.bodyLength,
  });

export const trackDiscussionReplyCreated = (p: {
  discussionId: string;
  moduleId: string;
  bodyLength: number;
}) =>
  capture("discussion_reply_created", {
    discussion_id: p.discussionId,
    module_id: p.moduleId,
    body_length: p.bodyLength,
  });

/* ---- Learn ------------------------------------------------------------ */

export const trackModuleViewed = (p: {
  moduleId: string;
  moduleTitle: string;
  submoduleCount: number;
}) =>
  capture("module_viewed", {
    module_id: p.moduleId,
    module_title: p.moduleTitle,
    submodule_count: p.submoduleCount,
  });

export const trackLessonPageViewed = (p: {
  lessonId: string;
  submoduleId: string;
  moduleId: string;
  pageNumber: number;
  totalPages: number;
}) =>
  capture("lesson_page_viewed", {
    lesson_id: p.lessonId,
    submodule_id: p.submoduleId,
    module_id: p.moduleId,
    page_number: p.pageNumber,
    total_pages: p.totalPages,
  });

// Mobile's `lesson_completed` carries no custom props; web adds the ids so the
// "lessons completed" breakdown is possible (extra keys are non-breaking).
export const trackLessonCompleted = (p: {
  lessonId: string;
  submoduleId: string;
  moduleId: string;
}) =>
  capture("lesson_completed", {
    lesson_id: p.lessonId,
    submodule_id: p.submoduleId,
    module_id: p.moduleId,
  });

export const trackQuizCompleted = (p: {
  lessonId: string;
  submoduleId: string;
  moduleId: string;
  quizTitle?: string;
}) =>
  capture("quiz_completed", {
    lesson_id: p.lessonId,
    submodule_id: p.submoduleId,
    module_id: p.moduleId,
    quiz_title: p.quizTitle,
  });

/* ---- Checklist -------------------------------------------------------- */

export const trackChecklistTaskCompleted = (p: {
  taskTitle: string;
  taskPriority: string;
  source: string;
}) =>
  capture("checklist_task_completed", {
    task_title: p.taskTitle,
    task_priority: p.taskPriority,
    source: p.source,
  });

export const trackChecklistTaskUncompleted = (p: {
  taskTitle: string;
  taskPriority: string;
  source: string;
}) =>
  capture("checklist_task_uncompleted", {
    task_title: p.taskTitle,
    task_priority: p.taskPriority,
    source: p.source,
  });

/* ---- Community + feed ------------------------------------------------- */

// Mobile sends only `post_id_known`; web also tags `group_id` so the "posting in
// groups" breakdown (community group popularity) is possible.
export const trackPostCreated = (p: {
  postId?: number | null;
  groupId?: number | null;
}) =>
  capture("post_created", {
    post_id_known: Boolean(p.postId),
    group_id: p.groupId ?? null,
  });

export const trackCommentCreated = (p: {
  postId: number;
  commentId?: number | null;
  isReply: boolean;
  bodyLength: number;
}) =>
  capture("comment_created", {
    post_id: p.postId,
    comment_id: p.commentId ?? null,
    is_reply: p.isReply,
    body_length: p.bodyLength,
  });

export const trackGroupJoined = (p: { groupId: number; groupName: string }) =>
  capture("group_joined", { group_id: p.groupId, group_name: p.groupName });

export const trackGroupViewed = (p: { groupId: number; groupName: string }) =>
  capture("group_viewed", { group_id: p.groupId, group_name: p.groupName });

/* ---- Content translation (i18n Phase 2) -------------------------------- */


/**
 * Aliased rather than re-listed: this used to be its own union, and adding
 * `event`/`group`/`tip` to the service left it behind. One source of truth now
 * — `import type` erases at compile time, so no runtime dependency on the
 * service layer.
 */
type TranslatableContentType = TranslatableType;

export const trackTranslationRequested = (p: {
  type: TranslatableContentType;
  targetLanguage: string;
  postId?: number;
}) =>
  capture("translation_requested", {
    type: p.type,
    target_language: p.targetLanguage,
    ...(p.postId != null ? { post_id: p.postId } : {}),
  });

export const trackTranslationCacheHit = (p: {
  type: TranslatableContentType;
  targetLanguage: string;
}) =>
  capture("translation_cache_hit", {
    type: p.type,
    target_language: p.targetLanguage,
  });

export const trackTranslationCacheMiss = (p: {
  type: TranslatableContentType;
  targetLanguage: string;
}) =>
  capture("translation_cache_miss", {
    type: p.type,
    target_language: p.targetLanguage,
  });

/* ---- Resources (Trusted Services directory) --------------------------- */
// Mirrors the mobile app's `resources_*` events so web + mobile line up.

export const trackResourcesViewed = () => capture("resources_viewed");

export const trackResourcesCategoryOpened = (p: {
  category: PartnerCategory;
}) => capture("resources_category_opened", { category: p.category });

export const trackResourcesPartnerOpened = (p: {
  slug: string;
  category: PartnerCategory;
  partnershipType: PartnershipType;
}) =>
  capture("resources_partner_opened", {
    slug: p.slug,
    category: p.category,
    partnership_type: p.partnershipType,
  });

export const trackResourcesPartnerWebsiteOpened = (p: {
  slug: string;
  partnershipType: PartnershipType;
}) =>
  capture("resources_partner_website_opened", {
    slug: p.slug,
    partnership_type: p.partnershipType,
  });

export const trackResourcesProgramOpened = (p: {
  slug: string;
  programName: string;
}) =>
  capture("resources_program_opened", {
    slug: p.slug,
    program_name: p.programName,
  });
