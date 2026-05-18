import type { FeedTab, Post } from "@/types";
import { posts, followedUsernames } from "@/lib/mock/posts";

/**
 * Feed / posts data access.
 * TODO: replace with real data — every function below queries Supabase
 * (`posts`, `post_likes`, `post_saves`) once the backend is wired.
 */

export async function getFeedPosts(tab: FeedTab = "For You"): Promise<Post[]> {
  if (tab === "Following") {
    return posts.filter((post) =>
      followedUsernames.includes(post.author.username),
    );
  }
  if (tab === "Groups") {
    return posts.filter((post) => post.groupId !== null);
  }
  return posts;
}

export async function getGroupPosts(groupId: string): Promise<Post[]> {
  return posts.filter((post) => post.groupId === groupId);
}

export async function getUserPosts(userId: string): Promise<Post[]> {
  return posts.filter((post) => post.author.id === userId);
}

export async function getSavedPosts(): Promise<Post[]> {
  return posts.filter((post) => post.savedByMe);
}

export async function likePost(postId: string): Promise<void> {
  // TODO: replace with real data — upsert/delete in `post_likes`.
  void postId;
}

export async function savePost(postId: string): Promise<void> {
  // TODO: replace with real data — upsert/delete in `post_saves`.
  void postId;
}
