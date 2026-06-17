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
- **Post detail + comments — ✅ shipped (P2, PR #19).** `app/(main)/post/[postId]/page.tsx`
  renders the full post with **threaded comments + replies** (`parent_comment_id`,
  reply-to pill); comment services in `services/feed.ts` + hooks in `hooks/useFeed.ts`;
  the `post_comments` table has own-row RLS + a count-sync trigger.
- **Follow/unfollow — ✅ shipped (P3, PR #29).** `followUser`/`unfollowUser` write
  `user_followers`; the "Following" feed now populates.
- **Other-user profiles — ✅ shipped (P3, PR #29).** `getUserById` reads the real
  `users` row + follow counts (highlights also real via `lesson_highlights`). *Caveat:*
  persona/city/stage stay hidden by own-row RLS on `user_onboarding_profiles` (new item
  under "Profile / Social" below).
- **Account settings — ✅ shipped (P6, this PR).** `/settings` (edit profile, learning
  reminders, redo onboarding, legal links, sign out, disabled delete).
- **Notifications, search, block/report**: still absent.
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
| **P2 ✅** | Post detail page + comments (threaded + replies) — shipped (PR #19) | Core engagement loop | P1 |
| **P3 ✅** | Follow/unfollow + other-user profiles + followers/following lists — shipped (PR #29) | Unblocks the Following feed; social graph | — |
| **P4** | Block & report (users + posts) | Launch/app-store safety requirement | P2, P3 |
| **P5 ✅** | Profile editing + avatar upload (display name vs @handle) — shipped (avatar/bio/pronouns PR #24; display name in the settings PR) | Identity; reuses P1 upload | P1 |
| **P6 ✅** | Account settings (prefs, legal docs, sign out) — shipped (settings PR); delete account still stubbed (no RPC) | Launch/policy table-stakes | P5 |
| **P7** | Notifications (list + unread badge + write-on-action) | Retention | P2, P3 |
| **P8** | Search (posts / users / groups + recent) | Discovery | P3 |
| **P9** | Wire remaining mock-only post surfaces (saved / user / group posts) | Removes mock seams | P1–P3 |
| **P10** | Community daily tips edge fn *(was Phase 19)* | Content freshness | — |
| **P11 ✅** | Companion RAG wiring *(was Phase 20)* — shipped (PR #20, via OpenRouter) | AI value prop | — |
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

**P2 — Post detail page + comments — ✅ SHIPPED (PR #19)**
Delivered: route `app/(main)/post/[postId]/page.tsx` renders the full post + **threaded
comments with replies** (`parent_comment_id`, reply-to pill); service fns
`getComments`/`createComment`/`deleteComment`/`likeComment`/`unlikeComment` in
`services/feed.ts` + hooks in `hooks/useFeed.ts`; the `commentCount` badge links into
the detail page; `post_comments` table has own-row RLS + a count-sync trigger.
*Remaining parity nice-to-haves (small, single-DB):* @mention prefixes inside replies
(mobile `feat/comment-reply-chains`) and delete-own-post entry point from the detail page.

**P3 — Follow/unfollow + other-user profiles + followers/following lists — ✅ SHIPPED (PR #29)**
Delivered: `followUser`/`unfollowUser` (insert/delete `user_followers`, optimistic via
`useFollowMutation`) + `getFollowStatus`/`getFollowsYou` wired to the Follow button on
`profile/[userId]`; `getUserById` reads real `users` + counts; followers/following list
route + components; real highlights via `lesson_highlights`; comment author → profile
links, comment deep-link anchors (`#comment-<id>` + `:target`), a profile **Comments** tab
(`getUserComments` + Reddit-style `CommentCard`), a "Follows you" badge, and "Member since"
(`users.created_at`). *Remaining:* other-user persona/city/stage hidden by own-row RLS
(see "Profile / Social" below — needs the DB sandbox).

**P4 — Block & report (users + posts)**
Mobile: `services/users/{blockUser,unblockUser,reportUser,getBlockedUserIds}.ts`,
`services/posts/reportPost.ts`, `app/ReportScreen.tsx`. Web gap: none of it exists.
Scope: **block table** migration (web) + RLS + `blockUser`/`unblockUser`/`getBlockedUserIds`;
filter blocked authors out of `getForYouFeed`/`getFollowingFeed`/`getGroupsFeed` (see
"Block filtering in home feed" below); report flow (post + user) via an edge fn
(`report-post`/`report-user`) or a `reports` table insert; entry points on PostCard,
post detail, and profile.

**P5 — Profile editing + avatar upload — ✅ SHIPPED** *(includes old Phase 21)*
Delivered: avatar upload/remove (`updateAvatar`/`removeAvatar` → `avatars` bucket +
`users.profile_picture_url`) and bio/pronouns editing landed in PR #24; the editable
**display name** (distinct from the immutable `@username` handle) + a username editor land
in the settings PR (`updateDisplayName` → `user_onboarding_profiles.first_name`,
`updateUsername` → `users.username` with charset validation + unique-violation handling).
Re-run/edit of the onboarding fields reuses `OnboardingEditModal` (`saveOnboarding`
idempotent, `onConflict: id`).

**P6 — Account settings — ✅ SHIPPED (settings PR)**
Delivered: `/settings` route (`app/(main)/settings/page.tsx`) with Edit profile
(avatar + display name + username + bio + pronouns), Preferences (learning-reminders
toggle + Redo onboarding via `OnboardingEditModal`), Legal (real Notion URLs for Privacy
Policy / Terms of Service / Community Guidelines), and Account (consolidated **sign out**
moved here, subtle sign-out kept in the sidebar). Mobile-only toggles (haptics, ATT ads)
skipped; push prefs out of scope. *Deferred:* **delete account** is a disabled "Coming soon"
button — no `delete_user` RPC exists on the web DB yet; wiring it needs the DB sandbox.

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

**P11 — Companion RAG wiring** *(was Phase 20)* — ✅ SHIPPED (PR #20)
`useSendMessage` now streams the real RAG answer + sources from the `rag-query` edge fn
(the canned reply is gone) and the squiggly background was removed. **The OpenAI-key
blocker is resolved:** both the query embedding (`openai/text-embedding-3-small`
*proxied via OpenRouter*) and the chat completion (Gemini-2.5-Flash → DeepSeek-v4-Flash
fallback) run through `OPENROUTER_API_KEY`, so no working `OPENAI_API_KEY` is needed.
PR #20 also raised the free limit to 6/day, redesigned the conversation sidebar, and
surfaces AI "suggested next steps" in the bubble (`messages.suggested_next_steps`).
*Deferred parity:* dynamic/personalized starter chips that refresh on tap (mobile
`feat/companion-dynamic-chips`) — web chips are still a static array. See "Feasible
mobile-parity gaps" below.

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

## Feasible mobile-parity gaps (no shared social graph / DB sandbox needed)

Surfaced from a mobile-repo sweep (`UnifyCN/mobile-app`, merged PRs #1–#276, 2026-06-06)
cross-referenced against web `main` (through PR #22). These are features that exist on
**mobile but are missing/incomplete on web** *and* are buildable on the web app's own
Supabase project alone — they don't depend on the cross-DB social graph (follow/notify),
so they're unblocked today. Ordered roughly by value. Scope each into its own PR.

| # | Gap | Mobile origin | Feasibility note |
|---|-----|---------------|------------------|
| **G1** | **Internationalization / multi-language** — no `next-intl`/`i18next`, no `locales/`, no language switcher exists on web at all | `multi-lang-support` (#261) | Largest item; pure UI/content + a locale store. No social graph. Pick a lib, extract strings, add a switcher (persist to profile/localStorage). |
| **G2 ✅** | **Learn: text-selection highlights + Ask AI — shipped (PR #28)** | `feat/learn-text-selection-highlights` (#222) | Word-level selectable lesson content with Highlight/Remove + Ask AI (`explain-term` edge fn); persisted to `lesson_highlights` via `20260607120000_lesson_highlights_mobile_parity.sql` (`services/highlights.ts`). |
| **G3** | **Learn: save/favourite lessons UI** — star/save a module or lesson | `learn-saves` (#225) | **Backend already done:** `learn_favourites` service in `services/learn.ts` + `useToggleFavouriteModule` hook + `Module.isFavourite`. Just **no UI calls them** — add a star toggle on the module card/detail and a "Saved" filter. |
| **G4** | **Post image full-screen viewer / lightbox** — tap a post image to enlarge | `image-viewer` (#231) | Pure frontend. Compose + `post_image_urls` already ship (P1); add a modal lightbox in `PostCard`/post detail. |
| **G5** | **Rich-text rendering in posts** — posts currently render plain text only | `image-uploading` (#208), `rich-text` (#241) | Content rendering; reuse the lesson `PortableTextRenderer`/markdown approach. No social graph. |
| **G6** | **Checklist: drag-and-drop reordering** | `feat/checklist-drag-reorder` (#249) | Single-user ordering; needs a `@dnd-kit` (or similar) integration + a per-user order column/persist. |
| **G7** | **Checklist: confetti on completion** | `feature/checklist-confetti-animation` (#251) | Pure frontend polish (checkbox-pop animation already exists; add confetti on section/all-complete). |
| **G8** | **Companion: dynamic personalized starter chips** — chips that refresh on tap, generated from the profile | `feat/companion-dynamic-chips` (#257) | Web chips are a **static array** (`StarterPromptChips.tsx`). Single-user personalization; can reuse the OpenRouter plumbing already deployed. |
| **G9** | **First-name personalization** — onboarding now collects `first_name`, but the Learn greeting still uses `@username` | `feat/personalized-name-greeting` (#270) | Tiny: thread `first_name` into the Learn (and optionally Home) greeting. |
| **G10** | **Apple Sign-In** — login button is a visual stub (`onClick`-less) | `feature/apple-sign-in` (#210) | Web auth; second-priority per CLAUDE.md. Wire `signInWithOAuth({ provider: 'apple' })` + callback, mirroring Google. |

**Adjacent items that DO need the social graph (kept in the P-roadmap, not here):**
~~follow/unfollow + other-user profiles (P3 — ✅ shipped PR #29)~~, notifications
write-side (P7), user search (P8), block/report (P4), referrals/auto-follow (P13),
show-mutuals.

**Partial-credit corrections from the same sweep:**
- **Profile badges — already BUILT on web** (persona badge + 5-segment stage indicator +
  city/province), so mobile's `feat/profile-badges` (#176) is not a gap.
- **Account settings (P6) — ✅ shipped (settings PR).** The `/settings` route landed with
  legal links (`feature/legal-and-guidelines` #140 — real Notion URLs for Privacy Policy /
  Terms of Service / Community Guidelines) and consolidated sign-out. **Delete account**
  (`deleteAccount` #179) remains a disabled "Coming soon" stub — no `delete_user` RPC on the
  web DB yet (needs the DB sandbox).
- **Profile editing (P5) — ✅ shipped.** `OnboardingEditModal` (PR #22) + avatar upload &
  bio/pronouns (PR #24) + the editable **display name** vs immutable `@handle` and a
  username editor (settings PR). Nothing outstanding.

---

## Shipped / in-flight

**PR #29 — Social graph (`feat/social-graph`)**
Follow loop end-to-end: `followUser`/`unfollowUser` (insert/delete `user_followers`,
optimistic via `useFollowMutation`); real other-user profiles (`getUserById` → real
`users` + follow counts); followers/following list route + components; comment author →
profile links; comment deep-link anchors (`#comment-<id>` scroll + `:target` highlight);
profile **Comments** tab (`getUserComments` + Reddit-style `CommentCard`); "Follows you"
badge; "Member since" (`users.created_at`). (= P3.) *Known gap:* other-user
persona/city/stage hidden by own-row RLS on `user_onboarding_profiles` (see "Profile /
Social" below).

**PR #28 — Learn: complete section (`feat/learn-complete`)**
Learn is feature-complete: text-selection **highlights** + **Ask AI** (`explain-term`
edge fn, word-level selectable content); deep whole-word **search**; **Framer Motion**
animations (submodule row expansion); **sticky filter sidebar** (stage filter,
"Recommended for you", sort, weekly progress); lesson **keyboard paging** (←/→);
**practice-question breakdown** on the submodule landing; refined microcopy. Highlights
persist to `lesson_highlights` (`services/highlights.ts`) via
`20260607120000_lesson_highlights_mobile_parity.sql`. (= G2 + Learn polish.)

**PR #22 — Onboarding: 11-step mobile-parity wizard (`feat/onboarding-update`)**
`components/onboarding/` now mirrors the mobile flow end-to-end: name (first name) →
persona → referral source → arrival date → location → goals → learning interests →
hobbies → learning reminders → outcome preview → confirmation. Added columns
`first_name` / `referral_source` / `hobbies[]` / `learning_reminders` via
`20260605120000_onboarding_extra_fields.sql`; `OnboardingEditModal` reuses the flow in
"edit" mode from the profile header. *(Note: greeting still uses `@username`, not the
new `first_name` — see G9.)*

**PR #21 — Learn: practice AI feedback (`feat/practice-feedback`)**
Free-text practice answers (`long_answer` / `short_answer`) are graded by the new
`practice-feedback` edge function (DeepSeek-v4-Flash via the shared OpenRouter chain),
shown in `components/learn/practice/PracticeFeedbackModal.tsx`. No OpenAI dependency.
*(Closes the old Learn backlog item "AI feedback on free-text practice answers".)*

**PR #20 — Companion fixes: OpenRouter RAG + 6/day + sidebar (`feat/companion-fix`)**
`useSendMessage` now streams the real RAG answer + sources (canned reply removed);
embeddings + answering both run through OpenRouter (so the broken `OPENAI_API_KEY` is
no longer a blocker); free limit raised 3→6/day; blue squiggly background dropped;
conversation sidebar redesigned; AI "suggested next steps" surfaced in the bubble. (= P11.)

**PR #19 — Post detail page + threaded comments (`feat/post-detail`)**
New route `app/(main)/post/[postId]/page.tsx` + comment services/hooks in
`services/feed.ts` / `hooks/useFeed.ts`; `post_comments` table with own-row RLS +
count-sync trigger. (= P2.)

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

## Profile / Social

**Other-user persona / city / stage hidden by own-row RLS** *(needs the DB sandbox)*
From P3 (PR #29). `user_onboarding_profiles` has own-row SELECT RLS
(`onboarding_select_own`: `id = auth.uid()`), so `getUserById` (`services/profile.ts`)
can only read the *caller's* onboarding row — for any other user it comes back null. The
result: on another user's profile the **persona badge, city/province, and stage indicator
don't render** (name/handle/bio/pronouns/follow counts/posts/comments all work). This is
by design (privacy-preserving), not a bug, and is documented in the `services/profile.ts`
header comment. To surface a sanitized public profile, add **one** of: (a) a
`public_profiles` view exposing only `persona`/`city`/`province`/`stage` with a
read-to-`authenticated` policy; (b) an additive SELECT policy on the table scoped to those
columns; or (c) an edge function returning a vetted public-profile shape. All three need
**DB write access** (the MCP is read-only and `db push` is unsafe against the drifted
remote history — see Phase 18 note), so this is parked until the DB sandbox is available.

**Delete account** *(needs the DB sandbox)*
From P6 (settings PR). The Settings → Account "Delete account" button is already stubbed
with "Coming soon" (disabled). Mobile calls `supabase.rpc('delete_user')`; the web DB has
no such RPC. Wiring it needs a `delete_user` SECURITY DEFINER function that handles the
**cascading deletes** across `users`, `user_onboarding_profiles`, `user_followers`,
`posts`, `post_comments`, `lesson_highlights` (and the user's other rows — likes / saves /
tasks / progress), plus the user's objects in the **storage buckets** (`avatars`,
`post-images`). Then wire the button to the RPC behind a confirm dialog on the web side.

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

**Storage upload MIME type enforcement (medium priority)**
Add magic-byte verification (e.g. using the `file-type` npm package) to `app/api/storage/route.ts` to verify actual file content matches the declared `Content-Type`, not just the client-declared MIME type. Today the upload branch validates `file.type` (the client-declared MIME) and `file.size` via `validateImageFile` (`lib/supabase/imageValidation.ts`), but a non-image sent with `Content-Type: image/png` still passes. Sniff the leading bytes server-side before signing/uploading.

**Storage Content-Length bypass (medium priority)**
The Content-Length guard in `app/api/storage/route.ts` (early 413 on the upload branch) can be bypassed with chunked transfer-encoding or an omitted `Content-Length` header — `Number(null)` is `0`, so the guard passes and `req.formData()` still buffers the whole body before `validateImageFile` checks size. Full protection requires bounding the body read itself (stream with a running byte cap), not trusting the declared header. Vercel's platform request-body cap backstops this in production, but local/other hosts have no such backstop.

**MAX_IMAGE_BYTES vs Vercel body cap (low/medium priority)**
`MAX_IMAGE_BYTES` is 5MB but Vercel's serverless request-body cap is ~4.5MB, so on Vercel a 4.5–5MB image is rejected by the platform with a generic error before reaching `app/api/storage/route.ts`, and the "Maximum size is 5MB" message is misleading. Reconcile the two (lower `MAX_IMAGE_BYTES` to match the platform cap, or document the discrepancy) so the limit the UI promises matches actual platform behaviour.

**Storage `get` is cross-user by design (accepted)**
`app/api/storage/route.ts` `get` signs a read URL for **any** key for any authenticated user — the edge function has no per-user scoping, and (unlike `remove`) `get` is intentionally not owner-scoped because the feed/profiles/comments must resolve other users' avatars and post images. This means any authenticated user who knows a key can read any stored object. Mitigation today: filenames are unguessable random UUIDs (`users/<uid>/<uuid>.<ext>`), so keys can't be enumerated, and only keys already visible to the user (from posts/profiles they can see) are resolvable. Future option if non-social/private content is ever stored under the same namespace: add per-user read scoping (or a separate private path) so `get` enforces ownership for those keys.

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

**Learn UI polish:**
- ✅ **Hero carousel** of in-progress modules with Continue (`ResumeHeroCarousel.tsx`) — shipped.
- ✅ **Filter/search** on the Learn page is now wired (filters the module list live) — shipped.
- ✅ **Highlights + Ask AI, deep search, animations, sticky sidebar, keyboard paging,
  submodule row expansion, practice-question breakdown** — shipped (PR #28). The Learn
  section is feature-complete; see the PR #28 entry under "Shipped / in-flight".
- ~~Animated dot/squiggle background on Learn~~ — **dropped.** PR #20 removed the squiggly
  background from Companion entirely, so there's no shared asset to port; skip unless product
  re-requests it.
- Still open: investigate why web may show fewer modules than mobile — check GROQ query vs mobile query.

**Submodule landing page pattern:**
- Mobile has a section landing page between submodule and lesson (shows section name, description, progress card with Continue). Web goes directly from submodule to lesson content. Discuss with team whether to add this route level (/learn/[moduleId]/[submoduleId] → /learn/[moduleId]/[submoduleId]/[lessonId]). Architectural change — needs team sign-off.

**AI feedback on free-text practice answers — ✅ SHIPPED (PR #21)**
Free-text practice/activity answers (`long_answer` / `short_answer`) are graded by the
`practice-feedback` edge function (DeepSeek-v4-Flash via the shared OpenRouter chain) and
shown in `PracticeFeedbackModal.tsx`. Did **not** need an OpenAI key — runs on OpenRouter.

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

---

## Email & Branding

**BIMI (Brand Indicators for Message Identification)**
Set up BIMI on unifysocial.ca so the Unify logo appears next to emails in Gmail and other
supporting clients. Requires a DNS TXT record pointing to a hosted SVG logo file. See
https://bimigroup.org for the implementation guide.

**Supabase Site URL — repoint before launch (blocks the change-email link)**
The change-email confirmation link uses `{{ .SiteURL }}/auth/callback` (see
`supabase/email-templates/change-email.html`), because the `emailRedirectTo` option on
`auth.updateUser` is a confirmed Supabase bug and is ignored. `{{ .SiteURL }}` resolves to the
project's single **Site URL** field, which is currently the mobile Expo URL
`exp://172.29.182.205:8081` — so the link won't resolve in a browser as-is. Before launch, update
the Supabase Site URL (Authentication → URL Configuration) to the **production web domain**, and
add `http://localhost:3000` to the **Redirect URLs** allowlist for local dev. Because Site URL is
a single value, change-email links resolve against whatever it's set to (so for local browser
testing of email change, temporarily point Site URL at `http://localhost:3000`). Coordinate with
the mobile app, which shares this Supabase project.
