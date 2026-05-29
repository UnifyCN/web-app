import type { CommunityCircle } from "@/types";

// Fallback CommunityCircle returned by getCurrentCircle() when Supabase isn't
// configured (local dev without env) or the signed-in user has no onboarding row.
// Real state is derived from community_match_waitlist / community_circle_members /
// community_circles in services/community.ts.
export const currentCircle: CommunityCircle = {
  id: "circle-1",
  persona: "skilled_worker",
  timeInCanada: 1,
  goal: "Build a professional network",
  topics: ["Job search", "Housing", "Settling in"],
  status: "default",
  endsAt: null,
};
