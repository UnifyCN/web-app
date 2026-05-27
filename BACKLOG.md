# Backlog

Items deferred from feature phases. Each entry has the phase it came from and enough context to action it later.

---

## Feed

**Block filtering in home feed**
Deferred from Phase 4. The web app has no block feature yet (no block table, no block UI, no edge function). When block functionality is built, the home feed services (getForYouFeed, getFollowingFeed, getGroupsFeed) need to fetch the current user's blocked IDs and filter them out of results — same pattern as mobile's getBlockedUserIdsForUser utility.

**Infinite scroll on home feed**
Deferred from Phase 4. Phase 4 fetches only the first page (20 posts) per tab. The service layer is written with cursor-based pagination so adding infinite scroll later only requires changing useQuery to useInfiniteQuery in hooks/useFeed.ts and adding an IntersectionObserver trigger in app/(main)/home/page.tsx.

**Pinned post ordering**
Deferred from Phase 4. Pinned posts are currently ordered by created_at because the web app's posts table has no pinned_at column (mobile has one). When pinned post management is added, a migration should add pinned_at timestamptz to posts and the getForYouFeed service should order pinned posts by pinned_at DESC.

---

## Profile

**Wrong column on user_onboarding_profiles query**
Fixed in PR #4. No action needed.

---

## Security

**Broad anon grant on live DB**
From Phase 9 pre-launch checklist. Before launch: run REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon; then re-apply only the three narrow anon SELECT grants needed for pre-login browsing.

**Full security audit**
Run the vibe-security skill against the entire codebase before launch (Phase 9). Focus areas: RLS policies, exposed keys, auth bypass vectors, service role key usage.

---

## Schema

**int4/int8 mismatch between mobile and web databases**
All identity columns in the mobile database are int4 (SERIAL) while the web uses int8 (BIGINT). Safe to read across both, but risky to join or write. Needs reconciliation in Phase 9 before web reads from mobile DB.

**Block user feature**
No block table exists on web. When building block functionality, reference mobile's implementation. Required before block filtering can be added to the feed (see above).
