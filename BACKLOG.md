# Backlog

Items deferred from feature phases. Each entry has the phase it came from and enough context to action it later.

---

## Upcoming phases

Planned next, in rough order. Scope each into its own PR.

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

**Phase 19 — Community: daily tips edge function**
Port the daily-tips edge function from mobile (mobile's `get-daily-tip`) so the web surfaces a rotating daily tip.

**Phase 20 — Companion: wire RAG to the UI**
Remove the blue squiggly lights from the Companion background and wire the deployed `rag-query` edge function to the chat UI (conversations, streamed answers, source citations). **Blocked on a working `OPENAI_API_KEY` (embeddings) from Savar** — the edge function + knowledge base are already deployed and the daily rate-limit RPC is in place.

**Phase 21 — Profile: display name vs username**
Instagram-style editing: a separate editable display name distinct from the immutable `@username` handle.

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
