import { isPostHogConfigured, posthog } from "@/lib/posthog";

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
  posthog.capture(event, properties);
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
