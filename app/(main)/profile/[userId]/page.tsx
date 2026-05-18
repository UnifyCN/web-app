import Link from "next/link";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { PostCard } from "@/components/home/PostCard";
import { getUserById, currentUser } from "@/lib/mock/users";
import { posts } from "@/lib/mock/posts";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const profile = getUserById(userId);

  if (!profile) {
    return (
      <div className="mx-auto max-w-[680px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">
          This profile could not be found.
        </p>
        <Link
          href="/home"
          className="mt-3 inline-block text-sm font-semibold text-primary"
        >
          Back to Home
        </Link>
      </div>
    );
  }

  const userPosts = posts.filter((post) => post.author.id === profile.id);

  return (
    <div className="mx-auto max-w-[680px] px-6 py-6">
      <h1 className="mb-5 text-center text-xl font-semibold text-ink-secondary">
        Profile
      </h1>

      <ProfileHeader
        profile={profile}
        postCount={userPosts.length}
        isOwnProfile={profile.id === currentUser.id}
      />

      <h2 className="mb-2 mt-6 text-sm font-semibold text-ink-secondary">
        Posts
      </h2>
      {userPosts.length > 0 ? (
        <div className="divide-y divide-border-card overflow-hidden rounded-card border border-border-card bg-surface">
          {userPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <p className="rounded-card border border-border-card bg-surface px-5 py-12 text-center text-sm text-ink-placeholder">
          No posts yet.
        </p>
      )}
    </div>
  );
}
