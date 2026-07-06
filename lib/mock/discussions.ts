import type { Discussion, DiscussionReply, ModuleDiscussionStats } from "@/types";
import { currentUser, priya, ahmed, mei, carlos } from "./users";

// Mock module-discussion boards — the local-dev / env-not-configured fallback
// for the In-Lesson Help community path. Threads reference the "documentation"
// module so the board renders content in mock mode regardless of the module the
// lesson belongs to (getDiscussions ignores the module filter when mocking).
// Includes a thread authored by `currentUser` so delete-own is exercisable.
// Mutations in mock mode don't persist (a refetch returns this static list).

export const mockDiscussions: Discussion[] = [
  {
    id: "d1a4c9e2-0000-4000-8000-000000000001",
    moduleId: "documentation",
    submoduleId: "permanent-residency",
    lessonId: "pr-card-basics",
    body: "My PR card expires next month but I'm not travelling. Do I actually need to renew it right away, or is it fine since my status doesn't expire?",
    likeCount: 24,
    replyCount: 2,
    status: "visible",
    createdAt: "2026-07-03T14:05:00Z",
    author: priya,
    likedByMe: true,
  },
  {
    id: "d1a4c9e2-0000-4000-8000-000000000002",
    moduleId: "documentation",
    submoduleId: "permanent-residency",
    lessonId: null,
    body: "Are the photo requirements for PR card renewal the same as the passport ones?",
    likeCount: 11,
    replyCount: 1,
    status: "visible",
    createdAt: "2026-06-30T09:40:00Z",
    author: carlos,
    likedByMe: false,
  },
  {
    id: "d1a4c9e2-0000-4000-8000-000000000003",
    moduleId: "documentation",
    submoduleId: "sin-and-id",
    lessonId: null,
    body: "Got my SIN at Service Canada the same day I asked about it here — thanks all! One tip: go early, the Tuesday morning line was short.",
    likeCount: 7,
    replyCount: 0,
    status: "visible",
    createdAt: "2026-06-28T18:12:00Z",
    author: currentUser,
    likedByMe: false,
  },
];

export const mockRepliesByDiscussion: Record<string, DiscussionReply[]> = {
  "d1a4c9e2-0000-4000-8000-000000000001": [
    {
      id: "e2b5d0f3-0000-4000-8000-000000000001",
      discussionId: "d1a4c9e2-0000-4000-8000-000000000001",
      body: "You don't lose status, but you'll want a valid card before any trip. I renewed ~9 months early and it took ~60 days.",
      likeCount: 9,
      createdAt: "2026-07-03T16:30:00Z",
      author: ahmed,
      likedByMe: false,
    },
    {
      id: "e2b5d0f3-0000-4000-8000-000000000002",
      discussionId: "d1a4c9e2-0000-4000-8000-000000000001",
      body: "And if you're already abroad with an expired card, look up the PRTD (the next lesson covers it).",
      likeCount: 2,
      createdAt: "2026-07-04T08:15:00Z",
      author: mei,
      likedByMe: true,
    },
  ],
  "d1a4c9e2-0000-4000-8000-000000000002": [
    {
      id: "e2b5d0f3-0000-4000-8000-000000000003",
      discussionId: "d1a4c9e2-0000-4000-8000-000000000002",
      body: "Yes — same 50x70mm spec. Most photo shops just ask \"passport or PR card?\" and print the same thing.",
      likeCount: 4,
      createdAt: "2026-06-30T12:02:00Z",
      author: priya,
      likedByMe: false,
    },
  ],
};

export const mockDiscussionStats: ModuleDiscussionStats = {
  discussionCount: mockDiscussions.length,
  participantCount: 5,
};
