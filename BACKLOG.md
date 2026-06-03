# Backlog

Items deferred from feature phases. Each entry has the phase it came from and enough context to action it later.

---

## Prioritized roadmap — mobile→web feature parity

Output of a thorough mobile-vs-web sweep (every mobile screen cross-checked against
the web `app/`/`components/`/`services/`/`hooks/`, ambiguous cases verified by reading
the service files). Ordered by **launch readiness**: finish the social loop, then the
safety + account items a public/app-store launch requires, then discovery, then the
already-deferred big features. Scope each phase into its own PR. This supersedes the
old Phase 19/20/21 entries (now folded in as P10/P11/P5).

**Verified findings that shaped this list:**
- **Onboarding is fully wired** (`services/onboarding.ts` → real `saveOnboarding`
  upsert into `user_onboarding_profiles`). *Not* a gap.
- **Compose post + image upload — ✅ shipped (P1, this PR).** `createPost` +
  `useCreatePost` (`services/feed.ts` / `hooks/useFeed.ts`); `CreatePostModal` is wired
  with a real groups picker and an image picker backed by `lib/supabase/uploadImage.ts`.
- **Comments + post detail do not exist** on web at all (no route/component/service;
  the `PostComment` type is defined but unreferenced).
- **Follow/unfollow are TODO no-ops** (`services/profile.ts`), so the wired "Following"
  feed can never populate from the web.
- **Other-user profiles + highlights are mock-only** (`getUserById` → `findUser` mock).
- **Notifications, search, account settings, block/report**: absent entirely.
  (Image upload — ✅ shipped with P1.)

**Constraints to carry into every phase:**
- The web app has its **own** Supabase project (`pbiszrycmcxmzxrnkkwr`), separate from
  mobile. "Wire to real data" = web tables; notification/comment rows only exist if the
  **web** writes them.
- Follow the established wiring pattern (`services/*` + `hooks/*`, `isSupabaseConfigured()`
  + `getAuthUserId()` guards, snake_case mappers, mock fallback, React Query keys +
  `onSuccess` invalidation).
- Image upload was on CLAUDE.md's "don't build yet" list — promoted to a phase here
  (gates post images + avatars). **Web push stays out of scope.**
- Each new table (`post_comments`, `community_notifications`, any block table) needs a
  **web** migration with own-row RLS + grants — verify it exists before wiring.

### Priority summary

| # | Phase | Why now | Depends on |
|---|-------|---------|-----------|
| **P1 ✅** | Compose post + image-upload utility — shipped (PR #18) | Core: users can't contribute today | — |
| **P2** | Post detail page + comments | Core engagement loop | P1 |
| **P3** | Follow/unfollow + other-user profiles + followers/following lists | Unblocks the Following feed; social graph | — |
| **P4** | Block & report (users + posts) | Launch/app-store safety requirement | P2, P3 |
| **P5** | Profile editing + avatar upload (display name vs @handle) | Identity; reuses P1 upload | P1 |
| **P6** | Account settings (prefs, delete account, legal docs) | Launch/policy table-stakes | P5 |
| **P7** | Notifications (list + unread badge + write-on-action) | Retention | P2, P3 |
| **P8** | Search (posts / users / groups + recent) | Discovery | P3 |
| **P9** | Wire remaining mock-only post surfaces (saved / user / group posts) | Removes mock seams | P1–P3 |
| **P10** | Community daily tips edge fn *(was Phase 19)* | Content freshness | — |
| **P11** | Companion RAG wiring *(was Phase 20)* — **BLOCKED: OpenAI key** | AI value prop | external key |
| **P12** | Circle chat + realtime + matching engine *(DEFERRED, large)* | Full Circles feature | schema exists |
| **P13** | Refer-a-friend / referrals *(DEFERRED, growth)* | Growth loop | P3 |

### Phase detail

**P1 — Create/compose posts + image-upload utility**
Mobile: `services/posts/createPost.ts`, `components/posts/CreatePostForm.tsx`,
`services/s3/uploadPostImage.ts`. Web gap: `CreatePostModal.tsx` is UI-only (TODO +
`setTimeout`); no `createPost`. Scope: add `createPost()` to `services/feed.ts`
(insert into `posts`; group destination — UI already has the picker) + `useCreatePost`
in `hooks/useFeed.ts` with feed invalidation; wire `CreatePostModal` to call the hook
(confirm it imports + calls the mutation, per CLAUDE.md "Always wire mutations to the
component"); shared **image-upload utility** (Supabase Storage bucket + `lib/supabase/
uploadImage.ts`, or port the `profile-picture-upload` edge fn) reused by P5; image
picker for `post_image_urls`.

**P2 — Post detail page + comments**
Mobile: `app/post-details.tsx`, `app/(tabs)/Gather/PostCommentItem.tsx`,
`services/posts/{createComment,deleteComment,likeComment}.ts`. Web gap: no detail route,
no comment UI/service; `PostComment` type unused. Scope: verify/add a **web**
`post_comments` table migration (own-row RLS + grants); new route
`app/(main)/post/[postId]/page.tsx` rendering the full post + threaded comments
(`parent_comment_id`) with comment compose, delete-own, like-comment, delete-own-post;
service fns `getPost`/`getComments`/`createComment`/`deleteComment`/`likeComment`/
`deletePost` + hooks; make the `commentCount` badge link into the detail page.

**P3 — Follow/unfollow + other-user profiles + followers/following lists**
Mobile: `services/users/followUser.ts`, `getFollowStatus.ts`, `app/followers-following.tsx`,
`components/profile/FollowButton.tsx`. Web gap: `followUser`/`unfollowUser` are no-ops;
`getUserById`/highlights mock-only. Scope: implement follow/unfollow (insert/delete
`user_followers`) + follow-status read and wire the existing Follow button on
`profile/[userId]`; wire `getUserById` to real `users` + `user_onboarding_profiles` (+
counts); followers/following list route + components; real highlights (`lesson_highlights`)
replacing the `getLessonHighlights` mock, or explicitly keep mock and flag.

**P4 — Block & report (users + posts)**
Mobile: `services/users/{blockUser,unblockUser,reportUser,getBlockedUserIds}.ts`,
`services/posts/reportPost.ts`, `app/ReportScreen.tsx`. Web gap: none of it exists.
Scope: **block table** migration (web) + RLS + `blockUser`/`unblockUser`/`getBlockedUserIds`;
filter blocked authors out of `getForYouFeed`/`getFollowingFeed`/`getGroupsFeed` (see
"Block filtering in home feed" below); report flow (post + user) via an edge fn
(`report-post`/`report-user`) or a `reports` table insert; entry points on PostCard,
post detail, and profile.

**P5 — Profile editing + avatar upload** *(includes old Phase 21)*
Mobile: `app/edit-name.tsx`, `components/profile/ProfilePictureUpload.tsx`,
`services/s3/uploadProfilePicture.ts`. Web gap: no edit UI; profile read-only; no avatar
upload. Scope: editable **display name** distinct from the immutable `@username` handle;
re-run/edit onboarding fields (persona, city/province, arrival date → stage) — reuse the
existing `OnboardingEditModal` (`saveOnboarding` is idempotent, `onConflict: id`); avatar
upload reusing the P1 utility → `users.profile_picture_url`.

**P6 — Account settings**
Mobile: `app/account-settings.tsx`, `app/legal-document.tsx`, `app/reset-password.tsx`.
Web gap: only sign-out (in sidebar). Scope: `/settings` route — language/prefs (where
applicable to web), legal docs (privacy / community guidelines), **delete account** (with
confirm), consolidated sign-out. Skip mobile-only toggles (haptics, ATT ads). Push prefs
out of scope.

**P7 — Notifications**
Mobile: `app/notifications.tsx`, `services/notifications/*`,
`hooks/useCommunityNotifications.ts` (realtime + 60s poll fallback). Web gap: absent.
Scope: verify/add web `community_notifications` table + RLS; **write side first** — P2
(comment/like-comment) and P3 (follow) must insert notification rows (service-side or DB
triggers), else the web's own DB stays empty (this is why P7 follows P2/P3); read side —
notifications route, unread-count badge in the sidebar, mark-read / mark-all-read,
tap-to-navigate. Realtime optional (poll first, matching mobile's fallback).

**P8 — Search**
Mobile: `app/search.tsx`, `services/users/{searchUsers,recentSearches,recentGroups}.ts`,
`services/groups/searchGroups.ts`. Web gap: only client-side filters inside Learn +
Community group list; no global search. Scope: `/search` route searching posts + users +
groups (ilike or RPC), recent-search history, see-more lists; sidebar/header search entry.

**P9 — Wire remaining mock-only post surfaces**
Web gap: `getSavedPosts`/`getUserPosts`/`getGroupPosts` in `services/feed.ts` are
mock-only. Scope: real queries (`post_saves` join; `posts` by `user_id`; `posts` by
`group_id`) with metadata enrichment, feeding the Profile Saved/Posts tabs + group-detail
feed. Small — can be absorbed into P1/P2/P3 rather than run standalone.

**P10 — Community daily tips** *(was Phase 19)*
Port mobile's `get-daily-tip` so the web surfaces a rotating daily tip (mobile also has
tip detail + a past-tips archive). Content/edge-fn work; no hard dependency.

**P11 — Companion RAG wiring** *(was Phase 20)* — **BLOCKED**
The `rag-query` edge fn + knowledge base are deployed; the daily rate-limit RPC is in
place. Replace the canned reply in `useSendMessage` with the streamed RAG answer +
sources and remove the squiggly background. **Blocked on a working `OPENAI_API_KEY`
(embeddings) from Savar.**

**P12 — Circle chat + realtime + matching engine** *(DEFERRED, large)*
Web wired only the EntryCard status + waitlist join/leave. Remaining: the matching RPC
that pairs 4 users, the 14-day expiry cron, realtime subscriptions, the
`/community/circle/[id]` chat route, and `community_circle_members`/`community_messages`
read/write. Confirm the `pool_key`/stage vocabulary reconciliation (see Schema below)
first. Full context in "Circles — matching engine, realtime, and chat" below.

**P13 — Refer-a-friend / referrals** *(DEFERRED, growth)*
Mobile has `refer-a-friend.tsx` + `welcome-from-inviter.tsx` (invite code, share sheet,
referral counter, inviter welcome moment). No web equivalent. Lowest priority.

**Cross-cutting items** (tech-debt / content — ride along with the relevant phase; full
detail in the sections below): apply the news seed migration to prod (see Phase 18
record); refactor direct Supabase calls out of the login page + sidebar; remove dead
signed-out fallback mock returns; the `refugee`/`other` empty-checklist persona gap;
infinite scroll on the home feed; the int4/int8 + own-DB cross-join caveat; growing the
`next.config.ts` image-host allowlist.

### Validating any phase end-to-end

1. `cd web-app && nvm use 22 && npm run dev` (Node 22 required).
2. With Supabase env set: sign in via Google, exercise the new mutation, reload to confirm
   persistence, check the row in Supabase (MCP `execute_sql` is read-only but fine for verify).
3. Confirm the **mock fallback** still works with env vars unset (the local-dev case).
4. `npm run build` must pass; run the section's `/impeccable audit` per CLAUDE.md gates.
5. For any new table: confirm the **web** migration applied with own-row RLS + grants.

---

## Shipped / in-flight

**Phase 18 — Community: events + news (shipped on `feat/community-phase18`)**
Events are now hard-coded from the mobile `events` table (17 BC settlement-agency
events in `lib/mock/events.ts`); `getEvents`/`getEventById` return that list
directly and no longer query Supabase (the web `events` table stays unused).
News stays wired to `news_details`, plus a new `link` column (source URL — news
has no in-app detail page, so items link out) and a seed migration
(`20260601130000_seed_community_news.sql`) carrying the 4 real articles.
Event/news cover-image hosts are allowlisted in `next.config.ts`.
**Follow-up — apply the news seed to the remote DB.** The seed migration was
*not* applied: the Supabase MCP is read-only here and `supabase db push` is unsafe
because the remote migration-history table is empty (it would try to re-create the
already-existing tables — a pre-existing tracking drift, schema was applied
out-of-band). Apply the migration via the dashboard SQL editor or with DB write
access. Until then production shows no news (events are unaffected — hard-coded).
As news grows, new publishers' image hosts must be added to `next.config.ts`.

---

## Feed

**Block filtering in home feed**
Deferred from Phase 4. The web app has no block feature yet (no block table, no block UI, no edge function). When block functionality is built, the home feed services (getForYouFeed, getFollowingFeed, getGroupsFeed) need to fetch the current user's blocked IDs and filter them out of results — same pattern as mobile's getBlockedUserIdsForUser utility.

**Infinite scroll on home feed**
Deferred from Phase 4. Phase 4 fetches only the first page (20 posts) per tab. The service layer is written with cursor-based pagination so adding infinite scroll later only requires changing useQuery to useInfiniteQuery in hooks/useFeed.ts and adding an IntersectionObserver trigger in app/(main)/home/page.tsx.

**Pinned post ordering**
Deferred from Phase 4. Pinned posts are currently ordered by created_at because the web app's posts table has no pinned_at column (mobile has one). When pinned post management is added, a migration should add pinned_at timestamptz to posts and the getForYouFeed service should order pinned posts by pinned_at DESC.

**Optimistic update count rollback**
Like/save mutations roll back local liked/saved boolean state on error (fixed in PR #5). However the displayed likeCount and saveCount are derived from post.likeCount + local toggle delta and will not roll back correctly if the mutation fails. A full fix requires tracking the pre-mutation count and restoring it on error. Deferred until optimistic updates are revisited.

---

## Community

**Circles — matching engine, realtime, and chat (deferred)**
Phase: Circles wiring. **Done:** the full mobile-mirrored schema landed (`community_match_waitlist`, `community_circles` with `pool_key`/`match_metadata` + `active|ended` status, `community_circle_members`, `community_messages`) with own-row RLS via the `is_circle_member` security-definer helper; `getCurrentCircle` derives the EntryCard status (default → waiting → in_circle) across the three tables; "Start Matching" inserts a waiting waitlist row (idempotent on the partial unique) and the waiting state can cancel it.
**Deferred:** the matching engine/RPC that actually pairs 4 users and writes `community_circles` + `community_circle_members` (mobile uses an RPC `join_community_waitlist`); the 14-day expiry cron (sets `ends_at`/`placement_deadline_at`, flips `status='ended'`); realtime subscriptions; the circle chat UI + a `/community/circle/[id]` route (until then the `in_circle` CTA is an inert "Chat coming soon"); `community_circle_members` join/leave wiring (`joined_at`/`left_at`) and `community_messages` read/write (tables + RLS exist, unwired); a goal/topics picker before joining (currently derived from onboarding `goals[0]` + `learning_interests`).

**requestGroup edge function**
Deferred from Phase 5. Mobile has sendGroupRequestEmail.ts that POSTs to an edge function; the web has no equivalent. Currently services/community.ts requestGroup is a no-op. Needs an email provider (Resend or similar) plus a Supabase edge function before requestGroup can do anything beyond accepting the form.

**Group member avatar real list**
Deferred from Phase 5. Group.memberAvatars is a UI-only convenience seeded from picsum (per group id). The database has no per-row member-avatar surface; mobile uses a separate signed-URL flow against S3. Replace with real member avatars when group detail pages need them.

---

## Checklist

**Persona-tag mismatch between web onboarding and Sanity checklist content**
From Phase 10 gap-closing. The web app's `Persona` type has 4 values (`international_student`, `skilled_worker`, `refugee`, `other`). Sanity's `checklist.personas` schema enum lists 6, but content currently uses only 4 tags — measured against `fercgabp/production` (170 docs): `international_student` (83), `skilled_worker` (87), `immigrant` (87), `pr` (87); `refugee` (0) and `protected_person` (0) have no content.

The checklist GROQ filters with `$persona in personas`, so per web persona:
- `international_student` → 83 docs. OK.
- `skilled_worker` → 87 docs. OK — every `immigrant`/`pr` doc is co-tagged `skilled_worker` (0 immigrant/pr-only docs), so nothing is missed today. This relies on the content team continuing to co-tag; an `immigrant`/`pr`-only doc would silently not surface for `skilled_worker` web users.
- `refugee` → 0 docs. A `refugee` web user gets a **genuinely empty** Sanity list — not the mock. `getTasks` only falls back to `mockTasks` when Supabase isn't configured, there's no auth session, or there's no onboarding row; but a `refugee`/`other` persona only exists once onboarding is complete, so those gates are already passed and the persona-filtered query simply returns 0 rows. The user sees an empty checklist plus any custom tasks they've added.
- `other` → 0 docs. Same empty-checklist outcome.

Content/product decision, not a code task in this scope. Options: (a) author `refugee`/`other` checklist content in Sanity, (b) map web personas → Sanity tags in `services/checklist.ts` (e.g. expand the GROQ to match a set), or (c) realign the two persona vocabularies. Flag the empty-checklist UX for `refugee`/`other` users to product.

**Checklist tasks deep-link to the Community tab instead of specific Learn content**
From Circles-wiring scoping. 29 published Sanity `checklist` docs set `link_tab == "community"` (verified `fercgabp/production`, 2026-05-29: `explore_and_connect`=21, `optional_later`=5, `do_soon`=2, `do_now`=1). Via `resolveLearnHowHref` (`services/checklist.ts`) all 29 "Learn how" links resolve to `/community`. Savar/product may prefer the `explore_and_connect` / `optional_later` tasks point at specific Learn modules/submodules instead — which means editing those docs' `link_tab`/`module`/`submodule` refs in Sanity (or adding a web-side override map). Content/product decision, no code change.

---

## Security

**Broad anon grant on live DB**
From Phase 9 pre-launch checklist. Before launch: run REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon; then re-apply only the three narrow anon SELECT grants needed for pre-login browsing.

**Full security audit**
Run the vibe-security skill against the entire codebase before launch (Phase 9). Focus areas: RLS policies, exposed keys, auth bypass vectors, service role key usage.

**`is_circle_member` SECURITY DEFINER (accepted)**
`public.is_circle_member` is intentionally `SECURITY DEFINER` and executable by `authenticated` (required to break the RLS recursion between `community_circles` and `community_circle_members`); it only returns whether the caller is a member of the passed circle id — no data leak. Flagged by the `authenticated_security_definer_function_executable` advisor; accepted, not a fix.

---

## Schema

**int4/int8 mismatch between mobile and web databases**
All identity columns in the mobile database are int4 (SERIAL) while the web uses int8 (BIGINT). Safe to read across both, but risky to join or write. Needs reconciliation in Phase 9 before web reads from mobile DB.

**Block user feature**
No block table exists on web. When building block functionality, reference mobile's implementation. Required before block filtering can be added to the feed (see above).

**Circle pool_key / stage vocabulary reconciliation**
From Circles-wiring. Web `Stage` (0-4) maps to mobile's pool-key time slugs via `STAGE_TO_TIME_SLUG` in `services/community.ts`, but the mapping is non-1:1 — stages 1 & 2 (both under one year on the web scale) collapse to `less_than_1_year`, and mobile's `2_to_3_years` slug is unused from the web side. `pool_key` equality is the matching/pairing key, so confirm this mapping with the mobile team before any cross-DB pooling (web circles currently only pool against web rows, and no engine reads them yet). Note the mapping now lives in **two** places that must stay in sync: the TS `STAGE_TO_TIME_SLUG` and the SQL `circle_time_slug` function (used by the `waitlist_insert_own` RLS check).

---

## Services

**Remove dead signed-out fallback mock returns**
Across services/feed.ts, services/community.ts, services/checklist.ts, services/companion.ts, and services/profile.ts, each query function has an `if (!await getAuthUserId()) return mock…` branch as a defensive fallback. The (main) route group is gated by the authenticated layout (proxy.ts redirects unauthenticated traffic to /login), so these paths are unreachable in production. Strip them in a separate PR after Phase 6 (Companion) merges, keeping only the `isSupabaseConfigured()` branch for the local-without-env case.

---

## Learn

**Learn UI polish (separate PR after Phase 7 merges):**
- Bring animated dot/squiggle background to the Learn page (already exists in globals.css for Companion)
- Hero carousel at top showing in-progress courses with Continue button and progress indicator (matches mobile pattern)
- Fix filtering/search on the Learn page — currently displays but is not wired up
- Investigate why web may show fewer modules than mobile — check GROQ query vs mobile query

**Submodule landing page pattern:**
- Mobile has a section landing page between submodule and lesson (shows section name, description, progress card with Continue). Web goes directly from submodule to lesson content. Discuss with team whether to add this route level (/learn/[moduleId]/[submoduleId] → /learn/[moduleId]/[submoduleId]/[lessonId]). Architectural change — needs team sign-off.

**AI feedback on free-text practice answers**
From Phase 16 (Practice). Free-text practice/activity answers (`long_answer` / `short_answer`) are currently un-graded — the user types and moves on. Add AI-generated feedback on these responses (likely a new edge function, reusing the Companion AI plumbing). Depends on the Companion AI key being unblocked (Phase 20).

**Tasks card on the section page**
From Phase 16. The submodule section page shows a Learn → Practice activity timeline. Add a Tasks card (checklist-style) so section-relevant tasks surface alongside Learn and Practice.

**"Documentation → Identification" Quick Check missing from Sanity**
From Phase 16. The Documentation module's "Identification" True/False Quick Check shown in a mobile screenshot does not exist in any Sanity project/dataset — it's a content gap, not a code bug. Content team to author the missing quiz doc.

---

## Navigation

**Tab reordering**
Reorder the sidebar nav to `Learn → Checklist → Companion → Community → Social` (pending product sign-off; PR #14 set the current mobile-mirrored order).

**Remove the Unify Circles tab**
PR #14 only *hides* the Circles tab. Once the product decision is final, remove it (and its route/components) outright rather than leaving it hidden.
