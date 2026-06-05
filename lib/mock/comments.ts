import type { PostComment } from "@/types";
import { currentUser, priya, ahmed, mei, carlos, olena } from "./users";

// Mock comment threads keyed by post id — the local-dev / env-not-configured
// fallback for the post detail page. Includes a two-level thread and a comment
// authored by `currentUser` ("u-me") so delete-own + replies are exercisable
// without Supabase. Mutations in mock mode don't persist (a refetch returns
// this static list), matching createPost's mock behavior.

export const commentsByPostId: Record<number, PostComment[]> = {
  1: [
    {
      id: 101,
      userId: ahmed.id,
      postId: 1,
      content:
        "This is so helpful — I didn't realise you could walk in without an appointment. Did you need anything besides the PR confirmation?",
      parentCommentId: null,
      likeCount: 8,
      createdAt: "2026-05-14T16:02:00Z",
      author: ahmed,
      likedByMe: false,
    },
    {
      id: 102,
      userId: priya.id,
      postId: 1,
      content:
        "Just your passport as a second piece of ID. Bring both and you're set!",
      parentCommentId: 101,
      likeCount: 3,
      createdAt: "2026-05-14T16:20:00Z",
      author: priya,
      likedByMe: true,
    },
    {
      id: 103,
      userId: currentUser.id,
      postId: 1,
      content: "Saving this for my landing week. Thank you for writing it up 🙏",
      parentCommentId: null,
      likeCount: 1,
      createdAt: "2026-05-14T17:45:00Z",
      author: currentUser,
      likedByMe: false,
    },
  ],
  2: [
    {
      id: 201,
      userId: mei.id,
      postId: 2,
      content:
        "The proof-of-funds + first/last upfront combo worked for me too. Worth offering it before they ask.",
      parentCommentId: null,
      likeCount: 12,
      createdAt: "2026-05-13T19:10:00Z",
      author: mei,
      likedByMe: false,
    },
    {
      id: 202,
      userId: carlos.id,
      postId: 2,
      content: "Three weeks of rejections is rough. Glad you stuck with it.",
      parentCommentId: null,
      likeCount: 4,
      createdAt: "2026-05-13T20:30:00Z",
      author: carlos,
      likedByMe: false,
    },
  ],
  3: [
    {
      id: 301,
      userId: olena.id,
      postId: 3,
      content:
        "The interim insurance tip is gold. Which provider did you go with?",
      parentCommentId: null,
      likeCount: 2,
      createdAt: "2026-05-11T10:15:00Z",
      author: olena,
      likedByMe: false,
    },
  ],
};

export function mockCommentsForPost(postId: number): PostComment[] {
  return commentsByPostId[postId] ?? [];
}
