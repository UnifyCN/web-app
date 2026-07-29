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
- **Notifications, search**: still absent. **Block/report** is **next up** — PR B
  (`feat/block-report`, = P4 below). (Image upload — ✅ shipped with P1.)

**Constraints to carry into every phase:**
- Since the **PR #31 DB cutover**, the web app runs on the **shared** Supabase project
  `wrbauxutkysljmsqojts` (web + mobile on one database; the original web-only
  `pbiszrycmcxmzxrnkkwr` is retired). "Wire to real data" = the shared tables — which the
  mobile app also reads/writes, so rows can already exist from mobile activity. *(Note:
  older "the web's own / separate DB" framing elsewhere in this backlog predates the
  cutover and should be read in that light.)*
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
| **P4 ⏭️ NEXT** | Block & report (users + posts) — **next up: PR B (`feat/block-report`)** | Launch/app-store safety requirement | P2, P3 |
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

**P4 — Block & report (users + posts) — ⏭️ NEXT UP (PR B, `feat/block-report`)**
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

## Post-cutover audit (2026-06-17) — unfixed findings

A deep regression audit (every feature compared before/after the PR #31 DB cutover,
plus PRs #33–35 and PR B), verified against the live shared DB `wrbauxutkysljmsqojts`.
The companion `rag-query` CORS proxy and six other fixes shipped on `feat/block-report`
(daily-limit constant aligned to the edge function at 6/day, onboarding gate →
`onboarding_completed`, `ChatLimitError` surfaced in the Companion UI, GIF dropped from
the upload allow-list, an `/api/onboarding-profile` proxy for the no-CORS
`public-onboarding-profile` fn, and a `post_report` UNIQUE migration). The items below were
**left unfixed** because they need shared-DB / mobile-owned-edge-function coordination or
are lower-priority latent risks.

**H2/H3 — Companion refund — ✅ RESOLVED (boolean `refund_chatbot_message`)**
*The earlier framing was wrong:* there was never a jsonb RPC or a `decrement_chatbot_usage`
function in production. The web Companion runs its **own** `rag-query-web` edge function
(distinct from mobile's `rag-query`), which uses the **boolean** `check_and_increment_chatbot_usage`
(cap 6) that is live on the shared DB. Savar's mobile **PR #277** added
`refund_chatbot_message(p_user_id uuid)` to the shared DB (already applied; self-scopes to
today's row, no `p_charged_date`). `rag-query-web` now refunds a failed generation via that
RPC on its retryable-503 and outer-catch paths (mirrors mobile). The abandoned jsonb design —
`supabase/migrations/20260530120100_chatbot_rate_limit.sql` and the old
`supabase/functions/rag-query/index.ts` port (jsonb `quota.allowed`/`charged_date` +
`decrement_chatbot_usage`) — was **deleted**; applying/deploying it would have broken the
shared boolean RPC that mobile + web both depend on. **Deployed:** `rag-query-web` was
redeployed to the shared project (v6) with the refund wired, so it is now live in production.
Embeddings go through **OpenRouter**
(`OPENROUTER_API_KEY`, a Supabase edge-function secret — not a Vercel env var); `OPENAI_API_KEY`
is unused by web. (`hooks/useCompanion.ts` persists the user message before `generateReply`,
which is unaffected — the refund corrects the *quota count*, not the message log.)

**KB `source_url` — legacy-seed gap, not an ingestion bug** *(backfill + mobile/ops follow-up)*
Some `knowledge_documents` have NULL `source_url`, so the Companion answer carries no citation pill
for them. Root cause: the `ingest-documents` **crawler** (mobile-owned, URL-sourced) **already sets
`source_url` on every doc it ingests** — the NULL rows are legacy from the original one-time CSV KB
seed (commit `c858d8d`) that imported files with `storage_path` but no `source_url`. Past migrations
backfilled most; SIN (5/22) and MSP/TFSA (8/11) are backfilled via the
`20260618130000` / `20260618140000` manual-apply migrations. ids 17 (Goals) / 18 (Networking) are
internal modules with no external source — intentionally left NULL. **No web code change**: the web
app has no KB-ingestion path, and a DB constraint/trigger on `source_url` would wrongly reject the
source-less internal docs. *Separate real blocker:* the crawler is currently failing with a
**resource-limit kill** (HTTP 546, ~6s runtime — likely OOM or a CPU timeout while batching
chunks/embeddings; verified the hourly cron POSTs are all 546, and it is NOT the OPENAI_API_KEY,
which is set — a missing key returns 500, not 546). Fix is smaller batches or streaming — in the
**mobile-owned** `ingest-documents`, out of web scope. Until then no new KB docs get ingested at all.

**M1 follow-up — `report-post` edge fn checks a non-existent `reports` table** *(mobile-owned edge fn)*
The live `report-post` function does its duplicate check against a `reports` table that doesn't
exist on the shared DB, so the check errors silently and every report inserts (firing a
moderator email each time). The committed `20260617160000_post_report_unique_reporter_post.sql`
migration (manual dashboard apply) enforces dedup at the DB level, but the mobile-owned
`report-post` fn should additionally map the resulting **23505** unique-violation → an
"Already reported" success/no-op so both web and mobile show a clean message rather than a
generic failure. (`services/moderation.ts` already treats `"Already reported"` as benign.)

**F1 — `posts.comment_count` drifts; no comment-count sync trigger on the shared DB** *(needs mobile-coordinated trigger)*
The web (and CLAUDE.md / this backlog's P2 note) assume an `update_post_comment_count` trigger
on `post_comments`. It **does not exist** on the shared DB — `comment_count` disagrees with the
real count on ~73% of live posts. User-facing counts are currently correct (the feed card reads
the **RPC-derived** count, the detail page uses `comments.length`), so impact is limited to the
RPC-error fallback in `services/feed.ts` and any other consumer trusting the column. Fix: add the
count-sync trigger on the shared DB (mobile-coordinated), or stop relying on the column.

**Lower-severity latent items**
- **Learn — `total_questions = 0` would violate a CHECK constraint.** The shared progress tables
  enforce `total_questions > 0`; `services/learn.ts` upserts pass it through unvalidated. Guarded
  today only by component/page render guards — any future caller reaching the service with an
  empty set throws a 23514. Add a service-layer guard.
- **Learn — `learn_favourites` / practice / quiz tables FK `public.users`** (not `auth.users`), so a
  brand-new account 23503s on those writes until `ensureUserRow` has bootstrapped its `public.users`
  row. Confirm the bootstrap runs before any Learn write.
- **Community — `news_details.category` has no data** on the shared DB (the badge never renders) and
  `getNews` sorts on a nullable `date` without `nullsLast`; `groups.member_count` is nullable but
  `rowToGroup` passes it through as `number`.
- **Feed — `createPost` inserts `title: ""`** instead of `null`, bypassing the mobile `'Untitled'`
  default (latent — the composer requires a title today).
- **Community Circles — stage ↔ `time_in_canada` mapping is non-bijective and type-unsound** (the
  `2_to_3_years` cohort, and `onboarding.stage as Stage` casts at `services/community.ts:354,401`).
  Latent because `timeInCanada` is unrendered and Circles is hidden. See Schema → "Circle pool_key /
  stage vocabulary reconciliation".

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
| **G6 ✅** | **Checklist: drag-and-drop reordering — shipped (PR #33)** | `feat/checklist-drag-reorder` (#249) | Rebuilt on `@dnd-kit` (translate-only transform); the framer-motion `Reorder` + `useDragControls` combo stuck on release. |
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

**Consolidate `rag-query` + `rag-query-web` → one shared function (`fix/consolidate-rag-query`)**
Merged the web-only `rag-query-web` fork back into the shared mobile-owned `rag-query` (one
function both platforms call) with Savar's sign-off, adopting the web behaviors for both:
**OpenRouter embeddings** (`OPENROUTER_API_KEY` / `OPENROUTER_EMBEDDING_MODEL`, replacing
OpenAI-direct), **raw-prompt retrieval** (dropped the `[Context: province, …]` prefix),
**no IRCC hardcoded source fallback** (`url = source_url || s3Url`, unattributed otherwise),
and **PostHog kept for all platforms** with a `platform` tag on `$ai_generation` (web proxy
sends `source:"web"` → `platform:"web"`, else `"mobile"`). Mobile's **SSE streaming** branch,
quota/refund RPCs, response shape, eval bypass, and `verify_jwt:true` are preserved unchanged;
added CORS + OPTIONS and a `first_name → username` name fallback; dropped the dead
`immigration_status`/`country_of_origin` profile reads (absent on the shared DB). Web side:
`/api/companion` repointed to `rag-query`, `rag-query-web` deleted, `config.toml`
`[functions.rag-query] verify_jwt = true` (now authoritative — we deploy `rag-query` from this
repo), CI `deno check` repointed. The unified source lives in `supabase/functions/rag-query/`;
**the mobile repo (`unify-front-end/supabase/functions/rag-query`) must be synced to match or a
future mobile deploy reverts it.** `_shared/openrouter.ts` + `posthogCapture.ts` were upgraded
to the mobile superset (adds `callOpenRouterStream`); `_shared/fetchWithRetry.ts` kept (web's is
newer — retries internal timeouts).

**PR #35 — Security hardening + KB `source_url` backfill (`feat/web-security-hardening`, = PR A)**
Storage upload hardening in `app/api/storage/route.ts` + `lib/supabase/imageValidation.ts`:
**magic-byte MIME sniffing** (`file-type`) rejecting non-image content or a payload that
contradicts the spoofable client `Content-Type`, signing/PUT-ing with the *detected* MIME off a
single `arrayBuffer()` read (route pinned to the Node.js runtime); `MAX_IMAGE_BYTES` lowered
**5MB → 4MB** (under Vercel's ~4.5MB body cap) with reconciled size strings; **411** on
missing/zero/non-numeric `Content-Length` (closes the `Number(null)===0` bypass). Plus a **KB
`source_url` backfill** migration (`20260617_kb_source_url_backfill.sql`) filling 14 of 16 NULL
`knowledge_documents` rows with authoritative gov/agency URLs (ids 17 Goals / 18 Networking left
NULL — no gov source; idempotent, applied to the web project via the dashboard, committed for
history) so `rag-query` answers carry a citation link, and the leaked-password-protection note in
the Security section. **Resolves the three storage Security items below.** (Remaining A3 audit
items — broad anon REVOKE, the 4 SECURITY DEFINER RPCs, enabling leaked-password protection —
still need DB/dashboard work; see Security.)

**PR #34 — Mobile DB security hardening (`fix/mobile-security-hardening-v3`)**
Records, as a versioned migration, the PR #25 hardening that was applied to the legacy **mobile**
Supabase project (`unify-social`, `wrbauxutkysljmsqojts`) via the dashboard:
`supabase/mobile-migrations/20260617_security_hardening_v3_web_parity.sql` REVOKEs anon/PUBLIC
`EXECUTE` on `pin_post`/`unpin_post`/`get_post_metadata_batch`/`merge_highlights` (advisor 0028)
and pins `search_path=public` on `set_updated_at()` (advisor 0011). Uses **mobile** signatures
(`pin_post(integer)`, 11-arg `merge_highlights`) — **do not run against the web-app project.**
Web-only/no-op sections of PR #25 (count-sync trigger fns, storage-listing policies) are N/A on
mobile. No change to the web app.

**PR #33 — Email/password auth + account management + checklist drag (`feat/email-auth`)**
Full email/password flow alongside Google SSO: welcome carousel → signup / login / verify-email
(6-digit OTP) / forgot-password / reset-password / before-you-continue (legal-consent gate),
backed by `services/auth.ts` (+ signup password-strength / common-password / email-typo
validation; Caps-Lock warning + eye-toggle on login). `proxy.ts` allows the public auth paths,
redirects signed-out → `/welcome`, and runs a terminal consent gate before the onboarding gate.
**Account management:** Change email / Change password modals (`components/account/`,
`hooks/useAccount.ts`). Also on this branch: **checklist drag-to-reorder rebuilt on `@dnd-kit`**
(closes G6) and the home-feed header renamed **"Home" → "Social"**. No DB migrations (email
provider toggled on the dashboard). *(Surfaced the leaked-password advisor item now that
email/password auth ships — see Security.)*

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

**Block filtering in home feed** *(lands with PR B / P4)*
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

**Other-user persona / stage — ✅ now surfaced via the `/api/onboarding-profile` proxy (PR B)**
From P3 (PR #29). `user_onboarding_profiles` has own-row SELECT RLS
(`onboarding_select_own`: `id = auth.uid()`), so a direct read of another user's onboarding
row returns null. The mobile `public-onboarding-profile` edge function (service-role) already
exposes the public-facing fields (`persona` / `persona_other` / `arrival_date`, with stage
derived from `arrival_date`); `getUserById` (`services/profile.ts`) calls it, but the function
ships **no CORS headers**, so the browser invoke was silently failing and the badges never
rendered. PR B added the same-origin **`/api/onboarding-profile` proxy** (mirrors
`/api/companion`), so the **persona badge + stage indicator now render** on other users'
profiles. *Still hidden by design:* **city / province / goals** (private — the function
deliberately doesn't return them). To also surface those, add option (a) a `public_profiles`
view, (b) a column-scoped additive SELECT policy, or (c) extend the edge function — all need
**DB write access** (the MCP is read-only; `db push` unsafe against the drifted history).

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

**Enable leaked password protection (pre-launch)**
Enable leaked password protection (HaveIBeenPwned.org) in Supabase Dashboard → Authentication → Sign In / Providers → Email. Requires Pro plan — enable before launch when upgrading. (Surfaced by the `auth_leaked_password_protection` advisor during the PR A security audit; newly relevant since email/password auth shipped in PR #33.)

**`is_circle_member` SECURITY DEFINER (accepted)**
`public.is_circle_member` is intentionally `SECURITY DEFINER` and executable by `authenticated` (required to break the RLS recursion between `community_circles` and `community_circle_members`); it only returns whether the caller is a member of the passed circle id — no data leak. Flagged by the `authenticated_security_definer_function_executable` advisor; accepted, not a fix.

**Storage upload MIME type enforcement — ✅ SHIPPED (PR #35)**
`app/api/storage/route.ts` now sniffs the actual leading bytes with the `file-type` package and
rejects uploads whose content isn't an allowed image (png/jpeg/webp) or **contradicts the
client-declared `Content-Type`** (which is spoofable); it signs + S3-PUTs with the *detected* MIME,
reusing the single `arrayBuffer()` read (route pinned to the Node.js runtime). Previously only
`file.type` + `file.size` were validated, so a non-image sent as `Content-Type: image/png` passed.

**Storage Content-Length bypass — ✅ ADDRESSED (PR #35)**
The upload branch now rejects missing/zero/non-numeric `Content-Length` with **411**, closing the
`Number(null)===0` path that let an unbounded body slip into `req.formData()`. *Residual (lower
priority now):* a true streaming byte-cap on the body read itself was **not** added — Vercel's
platform request-body cap remains the backstop in production, so a host without such a cap would
still buffer the full body before the size check.

**MAX_IMAGE_BYTES vs Vercel body cap — ✅ RESOLVED (PR #35)**
`MAX_IMAGE_BYTES` was lowered **5MB → 4MB** (under Vercel's ~4.5MB serverless body cap) and the two
user-facing size strings were reconciled, so the limit the UI promises now matches platform
behaviour.

**Storage `get` is cross-user by design (accepted)**
`app/api/storage/route.ts` `get` signs a read URL for **any** key for any authenticated user — the edge function has no per-user scoping, and (unlike `remove`) `get` is intentionally not owner-scoped because the feed/profiles/comments must resolve other users' avatars and post images. This means any authenticated user who knows a key can read any stored object. Mitigation today: filenames are unguessable random UUIDs (`users/<uid>/<uuid>.<ext>`), so keys can't be enumerated, and only keys already visible to the user (from posts/profiles they can see) are resolvable. Future option if non-social/private content is ever stored under the same namespace: add per-user read scoping (or a separate private path) so `get` enforces ownership for those keys.

---

## Schema

**int4/int8 mismatch between mobile and web databases**
All identity columns in the mobile database are int4 (SERIAL) while the web uses int8 (BIGINT). Safe to read across both, but risky to join or write. Needs reconciliation in Phase 9 before web reads from mobile DB.

**Block user feature** *(→ next up: PR B, `feat/block-report`, = P4)*
No block table exists on web. When building block functionality, reference mobile's implementation. Required before block filtering can be added to the feed (see above).

**Circle pool_key / stage vocabulary reconciliation**
From Circles-wiring. Web `Stage` (0-4) maps to mobile's pool-key time slugs via `STAGE_TO_TIME_SLUG` in `services/community.ts`, but the mapping is non-1:1 — stages 1 & 2 (both under one year on the web scale) collapse to `less_than_1_year`, and mobile's `2_to_3_years` slug is unused from the web side. `pool_key` equality is the matching/pairing key, so confirm this mapping with the mobile team before any cross-DB pooling (web circles currently only pool against web rows, and no engine reads them yet). Note the mapping now lives in **two** places that must stay in sync: the TS `STAGE_TO_TIME_SLUG` and the SQL `circle_time_slug` function (used by the `waitlist_insert_own` RLS check).

**Enforce non-null `news_details.image_link` end-to-end** *(needs Savar / shared-mobile-DB coordination)*
The CLAUDE.md rule + the `news-crawler` Unsplash fallback (PR #39) enforce a non-null `image_link` at the **app layer** only — every app-side insert now ships an image. But `types/index.ts` `NewsItem.imageLink` is still `string | null` and the shared `news_details.image_link` column is still nullable, so legacy rows and non-crawler / direct inserts can still violate it (the Home `NationalNewsWidget` / Community News card then render an empty thumbnail slot). Future work: make the TS field non-optional (`imageLink: string`, with the row mapper backfilling a fallback) and add a DB `NOT NULL` (+ optional default) constraint. The DB change touches the **shared mobile DB**, so coordinate with Savar / the mobile team before applying.

---

## Services

**Remove dead signed-out fallback mock returns**
Across services/feed.ts, services/community.ts, services/checklist.ts, services/companion.ts, and services/profile.ts, each query function has an `if (!await getAuthUserId()) return mock…` branch as a defensive fallback. The (main) route group is gated by the authenticated layout (proxy.ts redirects unauthenticated traffic to /login), so these paths are unreachable in production. Strip them in a separate PR after Phase 6 (Companion) merges, keeping only the `isSupabaseConfigured()` branch for the local-without-env case.

**Remove dead `LearningProgressSummary` chain** *(orphaned by PR #41)*
`PR #41` (`feat/learn-cards-social`) repointed the Home Learning-Progress widget to `useModules()` + the Learn `ModuleGridCard`, so the old summary path has **no live consumer** left. It's a self-contained dead chain: `useLearningProgressSummary` (`hooks/useLearn.ts`), `getLearningProgressSummary` (`services/learn.ts`), the `LearningProgressSummary` type (`types/index.ts`), and the `mockLearningProgress` mock (`lib/mock/progress.ts`). Left in place deliberately (not deleted) — strip in a follow-up PR. When removing, also drop the now-pointless `LEARNING_PROGRESS_KEY` invalidations in `useSetModuleStatus` + `useSetLessonProgress` (`hooks/useLearn.ts`) and the `LEARNING_PROGRESS_KEY` constant — nothing subscribes to that query key anymore.

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

**i18n Phase 4b — Learn static-string coverage (follow-up to Phase 4a)**
Phase 4a extracted the social surfaces (feed/post, community, companion, profile,
checklist, account, moderation, UI primitives). Learn remains hardcoded English:
route pages, chrome components (LearnSidePanel, ModuleGridCard, SubmoduleTimelineRow,
StartHereCard, …), practice/quiz (PracticeQuiz, QuizResults, PracticeQuestionList
type labels, **LessonPager + LessonQuiz — never translated in Phase 1 despite the
build-status claim**), and the entire help/discussion board (~55 keys, no namespace
exists). Recon estimated ~143 new keys. Also port `lib/learn/microcopy.ts`
(moduleProgressMessage/weeklyMessage) to key maps and switch
DiscussionThreadCard/DiscussionReplyItem to `useRelativeTime`.

**Translate button for Learn discussions + replies (i18n Phase 3 follow-up)**
The Phase 3 Translate UI covers posts + post comments only. Discussions live in
`module_discussions` / `discussion_replies` with **UUID ids**, but the deployed
`translate-content` edge function only accepts `type: 'post' | 'comment'` with integer
ids and fetches source text from `posts` / `post_comments`. Extending it needs backend
work: new `discussion` / `discussion_reply` types, UUID-keyed translation cache tables
(+ migration via the dashboard SQL editor), and a decision on whether they share the
20/day quota. Once that lands, drop `<TranslateButton>` into `DiscussionThreadCard` /
`DiscussionReplyItem` the same way as `PostCard` / `PostCommentItem`.

**Tasks card on the section page**
From Phase 16. The submodule section page shows a Learn → Practice activity timeline. Add a Tasks card (checklist-style) so section-relevant tasks surface alongside Learn and Practice.

**"Documentation → Identification" Quick Check missing from Sanity**
From Phase 16. The Documentation module's "Identification" True/False Quick Check shown in a mobile screenshot does not exist in any Sanity project/dataset — it's a content gap, not a code bug. Content team to author the missing quiz doc.

**Register `practice` + `quiz` with document-internationalization — ✅ DONE (unify-sanity PR, 2026-07-27)**
The 2026-07-27 translation run wrote **228 draft translations** (39 practice + 18 quiz
sources × vi/es/hi/ar) plus **57 `translation.metadata` docs** into `fercgabp/production`.
Both types are now registered with the `documentInternationalization` plugin in the Studio
source (`sanity.config.ts` `schemaTypes`, `structure.ts` `I18N_TYPES`, and a hidden read-only
`language` field on `schemaTypes/practice.ts` + `quiz.ts`), and the Studio is redeployed.
The 57 metadata docs are **published** for parity with the 378 lesson/checklist ones.

Also landed with it: the 39 + 18 published base docs had **no `language` field at all**
(unlike the other four types, backfilled by unify-sanity PR #12), so
`migrations/backfill-language-en` gained `practice` + `quiz` and was re-run — idempotent
(`!defined(language)` + `setIfMissing`), so it touched only those 57 docs.

**The 228 translated content docs remain unpublished drafts.** Publishing them is a separate,
deliberate decision — and it needs a native review of the machine translations plus a Savar
heads-up first (mobile reads the same dataset). Until then the overlay's weak-reference deref
returns null under `perspective: "published"` and English renders.

Still open: mobile's content editors now see a Translations tab on practice/quiz documents —
send Savar the heads-up.

**Practice/Quiz GROQ queries are not language-aware — ✅ DONE (`feat/practice-quiz-groq-i18n`)**
`PRACTICES_BY_SUBMODULE_QUERY` and `LESSON_QUIZ_QUERY` in `lib/sanity.ts` now carry the
`BASE_LANG` guard on the outer filter plus an `i18nOverlay`, and `MODULE_DETAIL_QUERY`'s
`practice_count` subquery is guarded too — without them, published translations (which keep
their English `submodule`/`lesson` ref) would have returned **5× duplicates**. The overlay
projects the full `questions[]` / `pages[]` bodies via the shared `QUIZ_QUESTION_FIELDS` /
`PRACTICE_PAGE_FIELDS` consts, so a translated variant comes back with the same field
selection *and* the same ordering as the base (`flattenPractices` depends on GROQ order).
Whole-array overlay is safe because the translations preserve `_key`s byte-identically —
see `docs/sanity-content-issues.md`. `getPractices` / `getLessonQuiz` take the trailing
`language` param and merge the overlay; `usePractices` / `useLessonQuiz` carry the language
in their React Query keys right after the prefix.

**`ecca3ca9` "bla bla" placeholder — ✅ DONE, English published**
`ecca3ca9-7b4a-4d22-a88d-2efc10f7d843` ("Activity: Mina's Story") had an answer box reading
**`"Permanent residents must stay bla bla"`** — unfinished placeholder copy where the PR
residency obligation belongs. The sourcing blocker is resolved: the requirement was verified
against IRCC on 2026-07-28 (730 days in every rolling 5-year period, IRPA s. 28 — see the two
Help Centre URLs in `docs/sanity-content-issues.md` P0 #2), English plus all four
translations were rewritten, and the **English is published and live**. Every edit touched
only `.text`, so no grading input changed and saved progress is untouched; `_key`s,
`options[].value` and `is_correct` were additionally verified byte-identical across all five,
keeping the translation drafts aligned.

The four translation drafts (`drafts.ecca3ca9-…-{vi,es,hi,ar}`) stay unpublished with the
other 224 until native review + a Savar heads-up, per the paragraph above. `051870f8`'s
`TSFA`→`TFSA` fix was published in the same pass. **No P0/P1 content defect from the
translation run remains open**; the P2 typos and P3 editorial items in
`docs/sanity-content-issues.md` are still there.

**Other Practice/Quiz content defects — all 5 P0/P1 items resolved (2026-07-28)**
Fixed and **published**: `2fe61c79` (answer box said "A,B, D" while the grader marked
A, B, C — it told newcomers a written RTB tenancy agreement was a red flag, in a
scam-awareness lesson), `ad1aa163` (two options missing the `C)` prefix their answer box
cites, space included), `b29a34f2` (truncated `"= $25,"` → `"= $25,000"`), `051870f8`
(`TSFA` → `TFSA`).
Remaining P2 typos / P3 editorial items are open; see `docs/sanity-content-issues.md`.

The constraint holds for any future fix, but the protected fields split into two kinds and
they are **not** the same list.

**Grading inputs.** `components/learn/practice/grade.ts:61-96` switches on `q.question_type`
(`:66`) to choose a branch, then reads the answer-bearing fields below. Changing the question
type, or any field read inside its branch, re-grades saved answers:

- **option `_key` + `is_correct`** — choice and true/false (`:70-73`); saved answers store the
  selected option `_key`s.
- **`matching_pairs[]._key` + `right_item`** — matching (`:79`); saved answers are encoded
  `` `${pairKey}::${rightItem}` ``, so a renamed `right_item` invalidates them.
- **`correct_answer.value`** — `short_answer` / `fill_blank` (`:87`); the learner's typed
  answer is compared against it, so editing it flips grades on re-grade.
- (`long_answer` passes on any non-empty response, `:84` — nothing to break.)

**Identity / translation-alignment fields.** Not read by `grade.ts`, but they must still stay
stable: every `_key` in the document, plus **`options[].value`**. The 228 translation drafts
were written `_key`-identical to their English source and the GROQ overlay replaces whole
arrays, so drift desyncs the translations even where it would not mis-grade on its own;
`options[].value` is what identifies an option across languages.

All four fixes above were verified `_key`-identical between published and draft before
publishing. `051870f8`'s `TSFA`→`TFSA` is the worked example of touching a real grading input
(`right_item`), so it was checked against the shared DB first: 1 affected row, already scored
0/1 on a different pair, so publishing it changed no stored score.

### Open follow-ups from the `ecca3ca9` round (PR #81, merged 2026-07-29)

**`ecca3ca9` residency text — "child" should be "dependent child"** — *low priority, content
owner, not urgent.*
The published answer box reads "…(or, if you are a child, a parent)…". IRCC
[qnum=1466](https://ircc.canada.ca/english/helpcentre/answer.asp?qnum=1466&top=10) scopes
condition 3 to a **dependent child** travelling with a parent, so the current wording
overstates the exception — an independent adult child does not qualify. Flagged by CodeRabbit
on PR #81 and deliberately deferred: the sentence is accurate on every other IRCC condition,
and quiz-content accuracy was out of scope for that session. Fixing it is the usual
five-document pass (patch + republish English, re-patch the 4 unpublished translation drafts),
so batch it into the next content-owner review rather than doing it alone.

**`encodeMatch` stores a display string, not a stable id — matching answers break on any
content edit** — *real fragility, tracked, not fixed.*
`components/learn/practice/grade.ts:13` encodes matching answers as
`` `${pairKey}::${rightItem}` `` and `:79` re-grades them with
`map.get(p._key) === p.right_item`, so renaming a pair's **display text** silently invalidates
every stored answer for that pair. `051870f8`'s `TSFA`→`TFSA` rename hit exactly this: one
saved row still encodes the old string and now renders that pair red on review — score-neutral
only because that learner had already mismatched a different pair. CodeRabbit raised it on
PR #81 (Major / "heavy lift"); both remedies it proposed were declined as disproportionate to
one row — teaching `grade.ts` to accept legacy content strings would push CMS history into a
pure grading module and grow with every future edit, and migrating persisted answers is a write
to the **shared** production DB needing Savar's sign-off. **The durable fix is to encode the
pair's target `_key` rather than its `right_item` text**, removing the coupling outright; that
needs a migration for existing `answers` payloads in `user_lesson_quiz_progress` and
`user_submodule_practice_progress`. Until then, treat any `right_item` edit as a breaking
change and run the shared-DB impact query first.

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

---

## CI / Tooling

**Edge functions are `@ts-nocheck`'d — `deno check` only validates the import graph**
`.github/workflows/edge-functions.yml` now type-checks *every* function entrypoint plus
`_shared/*.ts` (it used to check `rag-query` alone), but every
`supabase/functions/*/index.ts` and 4 of the 5 `_shared/*.ts` files open with
`// @ts-nocheck`, so real type errors inside them stay invisible. Verified: an injected
`const x: number = "str"` in a nocheck'd entrypoint still exits 0. Only module-resolution
errors (TS2307) and `_shared/posthogCapture.ts` — the one file without the pragma — are
actually caught. Removing the pragmas surfaces **13 errors** in four classes, triaged
separately rather than waved through as one category:

- **`rag-query` — client generics (4 errors, TS2345).** `fetchUserProfileContext` and
  `persistChatbotUsage` annotate `supabase: ReturnType<typeof createClient>` (the
  un-instantiated generic), which rejects the real `createClient(url, key)` instance; the
  same annotation types the `increment_chatbot_usage` RPC arg object as `undefined`.
  Compile-time only — one concrete client flows through every call site at runtime.
- **`translate-content` — PostgREST `ParserError` (4 errors, TS2339, ~lines 297-303).**
  Compile-time only, *verified*: `table` and `cacheColumns` are both unions of string
  literals, which defeats postgrest-js's literal-type select parser (hence the union-shaped
  `ParserError<"Unexpected input: " | "Unexpected input: , source_hash">`). Checked against
  the shared DB — every selected column exists on all four `*_translations` tables, with
  `translated_title` only on `post_translations`, exactly as the ternary encodes. The
  runtime query is valid.
- **`translate-content` — `.catch` on `PromiseLike<void>` (3 errors, TS2339, lines 354,
  372, 421). Latent, not cosmetic — fix this one on its own merit.** The three
  `.rpc('refund_translation_request', …).then(…).catch(…)` refund chains work today only
  because `PostgrestBuilder.then()` (postgrest-js 2.110.9) *declares*
  `PromiseLike<TResult1 | TResult2>` while *returning* `(res as Promise<…>).then(…)` — a
  native promise that happens to carry `.catch`. The declared contract does not guarantee
  it, so a postgrest-js move to a true thenable would throw on the refund path, where the
  failure is already silent. Safe form: `await Promise.resolve(builder).catch(…)`, or
  `try/catch` around the awaited chain — not a cast.
- **`translate-content` — implicit `any` params (2 errors, TS7006).** Cosmetic; Deno
  type-checks strict by default.

Fix one function per PR, redeploying each as it is un-nocheck'd so the type fix and the
deployed source stay in sync.
**`rag-query` is shared mobile infra → needs Savar's sign-off.**
