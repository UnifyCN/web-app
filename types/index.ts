/* ------------------------------------------------------------------ *
 * Unify shared types.
 *
 * Derived from the Supabase schema reference in CLAUDE.md. Used by the
 * mock data and (later) the service layer. No tables exist yet — these
 * describe the shape the UI consumes.
 * ------------------------------------------------------------------ */

/* ----- Onboarding profile ----------------------------------------- */

export type Persona =
  | "international_student"
  | "skilled_worker"
  | "refugee"
  | "other";

/**
 * Time-in-Canada stage.
 *  0 — not arrived yet
 *  1 — 0–3 months
 *  2 — 3–12 months
 *  3 — 1–3 years
 *  4 — 3+ years
 */
export type Stage = 0 | 1 | 2 | 3 | 4;

export interface UserOnboardingProfile {
  id: string;
  /** First name (display name across the app stays `username`). */
  firstName: string | null;
  persona: Persona;
  /** How the user heard about Unify (referral slug); null if unanswered. */
  referralSource: string | null;
  arrivalDate: string | null;
  city: string;
  province: string;
  stage: Stage;
  goals: string[];
  learningInterests: string[];
  /** Hobby slugs (see lib/onboarding/constants). */
  hobbies: string[];
  /** Opt-in to learning-reminder nudges. */
  learningReminders: boolean;
}

/* ----- Users ------------------------------------------------------- */

export interface User {
  id: string;
  username: string;
  profilePictureUrl: string | null;
  isPremium: boolean;
  /** Free-form permission flags; not enforced in the frontend build. */
  permissions: string[];
}

export interface UserProfile extends User {
  /** Null until the user finishes onboarding (no row in user_onboarding_profiles). */
  onboarding: UserOnboardingProfile | null;
  followingCount: number;
  followerCount: number;
  /** users.biography — free-text bio shown on the profile header. */
  bio: string | null;
  /** users.pronouns — e.g. "she/her". */
  pronouns: string | null;
}

/* ----- Posts & feed ------------------------------------------------ */

export type FeedTab = "For You" | "Following" | "Groups";

export interface Post {
  id: number;
  title: string;
  content: string;
  likeCount: number;
  commentCount: number;
  saveCount: number;
  userId: string;
  groupId: number | null;
  isPinned: boolean;
  postImageUrls: string[];
  createdAt: string;
  /** Convenience fields denormalised at the service layer (joined users/groups
   * and per-user enrichment from get_post_metadata_batch). */
  author: User;
  groupName?: string;
  likedByMe?: boolean;
  savedByMe?: boolean;
}

export interface FeedResponse {
  posts: Post[];
  nextCursor: string | undefined;
}

export interface PostComment {
  id: number;
  userId: string;
  postId: number;
  content: string;
  /** Null for a top-level comment; the thread-root comment id for a reply. */
  parentCommentId: number | null;
  likeCount: number;
  createdAt: string;
  /** Joined author row (mirrors Post.author). */
  author: User;
  /** Enriched from comment_likes for the current user. */
  likedByMe?: boolean;
}

/* ----- Community --------------------------------------------------- */

export interface Group {
  id: number;
  groupName: string;
  groupDescription: string;
  memberCount: number;
  coverPhotoUrl: string | null;
  joinedByMe: boolean;
  /** A handful of member avatar URLs for the member avatar stack. */
  memberAvatars: string[];
}

export type EventType = "in-person" | "online" | "hybrid";

export interface CommunityEvent {
  id: number;
  title: string;
  eventDatetime: string;
  eventEndDatetime?: string;
  location: string;
  eventType: EventType;
  coverPhotoUrl: string | null;
  externalLink: string | null;
  description: string;
  hostedBy: string | null;
}

export interface NewsItem {
  id: number;
  title: string;
  description: string;
  author: string | null;
  date: string;
  category: string | null;
  imageLink: string | null;
  /** External article URL — news has no in-app detail page, so items link out. */
  link: string | null;
}

/** A reference behind a daily tip (when KB-grounded). */
export interface DailyTipSource {
  documentTitle: string;
  url: string;
}

/**
 * Per-user, per-day personalized settlement tip from the `get-daily-tip` edge
 * function (surfaced on the Community → "News & Tips" tab).
 */
export interface DailyTip {
  id: string | number;
  category: string;
  title: string;
  description: string;
  tipText: string;
  date: string;
  sources: DailyTipSource[] | null;
}

export type CircleStatus = "default" | "waiting" | "in_circle";

export interface CommunityCircle {
  id: string;
  persona: Persona;
  timeInCanada: Stage;
  goal: string;
  topics: string[];
  status: CircleStatus;
  endsAt: string | null;
}

/* ----- Companion (chat) ------------------------------------------- */

export type MessageRole = "user" | "assistant";

export interface ChatSource {
  title: string;
  url: string;
}

export interface ChatMessage {
  /** Bigint primary key of `messages.id` — stable React key. */
  id: number;
  /** UUID conversation identifier (matches Conversation.id). */
  conversationId: string;
  role: MessageRole;
  content: string;
  /** Citations from the RAG backend; null when the assistant didn't cite. */
  sources: ChatSource[] | null;
  /** Model-suggested follow-up questions (assistant messages); absent otherwise. */
  suggestedNextSteps?: string[] | null;
  createdAt: string;
}

export interface Conversation {
  /** UUID `conversation_identifier`; the stable handle the UI selects with. */
  id: string;
  title: string | null;
  updatedAt: string;
}

export interface ChatbotUsage {
  messageCount: number;
  lastMessageAt: string | null;
}

/* ----- Checklist --------------------------------------------------- */

export type Priority =
  | "Do now"
  | "Do soon"
  | "Explore and connect"
  | "Optional / later";

export interface ChecklistTask {
  id: string;
  priority: Priority;
  title: string;
  description: string;
  completed: boolean;
  completedAt: string | null;
  /** Optional deep-link to a Learn module / external how-to. */
  learnHowHref?: string;
  /** Custom tasks are user-created; seed tasks come from Sanity. */
  isCustom: boolean;
}

/* ----- Learn ------------------------------------------------------- */

export type ModuleStatus = "not_started" | "in_progress" | "completed";

/* Sanity content types — mirror the deployed `fercgabp/production` schema.
 * Content lives in Sanity; per-user progress lives in Supabase (see below). */

export interface SanityImage {
  _type: "image";
  asset: { _ref: string; _type: "reference" };
}

/** A Sanity Portable Text span (inline run inside a block). */
export interface SanitySpan {
  _key: string;
  _type: "span";
  marks: string[];
  text: string;
}

/** A Sanity Portable Text block (paragraph, heading, or list item). */
export interface SanityBlock {
  _key: string;
  _type: "block";
  style?: string;
  listItem?: "bullet" | "number";
  level?: number;
  markDefs?: { _key: string; _type: string; [k: string]: unknown }[];
  children: SanitySpan[];
}

/** A lesson body page (or ending page) — title + portable-text content. */
export interface SanityLessonPage {
  _key: string;
  _type: "page" | "endingPage";
  title?: string;
  order: number;
  content: SanityBlock[];
}

export interface SanityLesson {
  _id: string;
  _type: "lesson";
  title: string;
  slug?: { current: string };
  description?: string | null;
  order: number;
  /** Available on detail queries only (LESSON_DETAIL_QUERY). */
  pages?: SanityLessonPage[];
  /** Schema-defined but empty across all production lessons today. */
  activity_pages?: SanityLessonPage[];
  /** Optional summary pages — present on ~17% of production lessons. */
  ending_pages?: SanityLessonPage[];
  /** Populated by MODULE_DETAIL_QUERY's count(pages) projection. */
  lesson_page_count?: number;
}

export interface SanitySubmodule {
  _id: string;
  _type: "submodule";
  title: string;
  description?: string | null;
  order: number;
  /** Number of `practice` docs referencing this submodule (MODULE_DETAIL_QUERY).
   * Drives the "Quick Check" row in the module table of contents. */
  practice_count?: number;
  lessons?: SanityLesson[];
}

export interface SanityModule {
  _id: string;
  _type: "module";
  /** Sanity system field — document creation time (for "Newest" sort). */
  _createdAt?: string;
  title: string;
  description?: string | null;
  colorTheme?: { hex: string } | null;
  /** Material-style icon name (e.g. "school", "language"); not a Sanity
   * image asset. No web-side glyph mapping yet — UI leans on
   * `colorTheme.hex` for visual identity. */
  icon?: string | null;
  /** Persona slugs this module is relevant to (for recommendation scoring).
   * Coalesced to [] in GROQ; matches the mobile `personalize` data. */
  personas?: Persona[];
  /** Learning-interest slugs this module covers (recommendation scoring). */
  interests?: string[];
  submodules?: SanitySubmodule[];
}

/* Practice / quiz content — mirrors the mobile `practice` Sanity document
 * (`mobile-app/.../types/sanity.ts`). A `practice` references a submodule and,
 * when `practice_type === "quiz"`, carries an array of questions. */

export type QuizQuestionType =
  | "multiple_choice_single"
  | "multiple_choice_multiple"
  | "true_false"
  | "matching"
  | "fill_blank"
  | "short_answer"
  | "long_answer";

export interface SanityQuizOption {
  _key: string;
  text: SanityBlock[];
  value: string;
  is_correct: boolean;
  explanation?: SanityBlock[] | null;
}

export interface SanityMatchingPair {
  _key: string;
  left_item: string;
  right_item: string;
  explanation?: SanityBlock[] | null;
}

/** Feedback shown after a question is submitted (when `showAfterSubmit`). */
export interface SanityAnswerBox {
  content?: SanityBlock[];
  showAfterSubmit?: boolean;
}

export interface SanityQuizQuestion {
  _key: string;
  question_type: QuizQuestionType;
  question_text: SanityBlock[];
  /** Present for choice / true-false questions. */
  options?: SanityQuizOption[];
  /** Present for matching questions (right_items repeat — they're categories). */
  matching_pairs?: SanityMatchingPair[];
  /** Present for free-text questions (fill_blank / short_answer / long_answer). */
  correct_answer?: { value: string[]; explanation?: SanityBlock[]; points?: number };
  order_number: number;
  answer_box?: SanityAnswerBox | null;
}

/**
 * One item inside an activity page's `instructions[]`. Heterogeneous — the
 * `_type` is the discriminator: `block` (portable text), `*_input_box`
 * (free-text), `multiple_choice_single` / `multiple_choice_multiple` /
 * `two_options_question` (choice), `matching_question`, `checklist_checkbox`.
 * Permissive shape; `flattenPractices` reads only what each type needs.
 */
export interface SanityActivityInstruction {
  _key: string;
  _type: string;
  /** Present on `block` instructions (the object IS a SanityBlock). */
  children?: SanitySpan[];
  style?: string;
  markDefs?: SanityBlock["markDefs"];
  /** Present on choice / matching instructions. */
  question_text?: SanityBlock[];
  options?: SanityQuizOption[];
  matching_pairs?: SanityMatchingPair[];
  /** Present on `*_input_box` instructions. */
  label?: string;
  placeholder?: string;
}

export interface SanityActivityPage {
  _key: string;
  title?: string;
  order: number;
  answer_box?: SanityAnswerBox | null;
  instructions?: SanityActivityInstruction[];
}

export interface SanityPractice {
  _id: string;
  _type: "practice";
  title: string;
  description?: string | null;
  practice_type: "quiz" | "activity";
  order_number: number;
  submodule?: { _id: string; title: string };
  /** Present on quiz-type practices. */
  questions?: SanityQuizQuestion[];
  /** Present on activity-type practices. */
  pages?: SanityActivityPage[];
}

/**
 * Lesson-level "Quick Check" quiz — a `_type == "quiz"` document that references
 * a lesson. Its `questions[]` share the practice `SanityQuizQuestion` shape, so
 * the same renderers apply.
 */
export interface SanityLessonQuiz {
  _id: string;
  _type: "quiz";
  title: string;
  description?: string | null;
  order_number: number;
  questions?: SanityQuizQuestion[];
}

/* Supabase per-user state. */

export interface LessonProgress {
  sanityLessonId: string;
  progressPercent: number;
  isCompleted: boolean;
  updatedAt: string;
}

/** Per-section quiz progress (one row per user+submodule). */
export interface PracticeProgress {
  submoduleId: string;
  currentQuestionIndex: number;
  /** Whether the question at `currentQuestionIndex` was already submitted —
   * so a resume restores its post-submit feedback + locked state. */
  currentSubmitted: boolean;
  /** Resume state: question `_key` → the user's selection(s). */
  answers: Record<string, string[]>;
  isCompleted: boolean;
  score: number | null;
  totalQuestions: number | null;
  updatedAt: string;
}

/** Per-lesson Quick Check completion (one row per user+lesson). */
export interface LessonQuizProgress {
  lessonId: string;
  isCompleted: boolean;
  score: number | null;
  totalQuestions: number | null;
  updatedAt: string;
}

/** UI viewmodel: Sanity module + merged per-user state. */
export interface LearnModuleView extends SanityModule {
  status: ModuleStatus;
  progressPercent: number;
  isFavourite: boolean;
}

/** Compact learning-progress entry for the Home right-panel widget. */
export interface LearningProgressSummary {
  moduleId: string;
  moduleName: string;
  progressPercent: number;
  colorHex: string | null;
}
