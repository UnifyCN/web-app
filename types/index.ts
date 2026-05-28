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
  persona: Persona;
  arrivalDate: string | null;
  city: string;
  province: string;
  stage: Stage;
  goals: string[];
  learningInterests: string[];
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
  id: string;
  userId: string;
  postId: string;
  content: string;
  parentCommentId: string | null;
  likeCount: number;
  createdAt: string;
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
  lessons?: SanityLesson[];
}

export interface SanityModule {
  _id: string;
  _type: "module";
  title: string;
  description?: string | null;
  colorTheme?: { hex: string } | null;
  /** Material-style icon name (e.g. "school", "language"); not a Sanity
   * image asset. No web-side glyph mapping yet — UI leans on
   * `colorTheme.hex` for visual identity. */
  icon?: string | null;
  submodules?: SanitySubmodule[];
}

/* Supabase per-user state. */

export interface LessonProgress {
  sanityLessonId: string;
  progressPercent: number;
  isCompleted: boolean;
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
