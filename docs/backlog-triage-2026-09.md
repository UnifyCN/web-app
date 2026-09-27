# Backlog triage (2026-09)

**Report only.** No BACKLOG.md edits in this PR.

Source: `BACKLOG.md` on `main` @ `0629839` (1126 lines). Open status spot-checked against code; DB/dashboard/Sanity state not checked (no network). Impact is scored from a newcomer's point of view.

Legend: **Savar** = needs Savar's sign-off. **DB** = needs a migration, RLS, RPC, or dashboard change on the shared DB.

### Ranked open items

| # | Item | Ref | Impact | Effort | Savar | DB |
|---|------|-----|--------|--------|-------|----|
| 1 | `refugee`/`other` personas get an **empty** checklist (0 Sanity docs match) | Checklist L673 | **High**: the most vulnerable users get no tasks | S | No (web-side mapping) | No |
| 2 | Supabase Site URL still points at the Expo `exp://` URL, so the change-email link can't open in a browser | Email L1012 | **High**: users who change their email get a broken link (current value not checked) | S | Yes (shared auth config) | Dashboard |
| 3 | Cover-letter job import is gated on the **resume** quota (**fixed in PR #152**, pending merge) | Resume/CL L1112 | Med: users are wrongly told they hit their limit | S | No | No |
| 4 | Tab state lives only in `useState` on Home, Profile, other-user Profile and Followers, so Back resets it | Community L622 | Med: Back from a post jumps the feed to "For You" | S | No | No |
| 5 | Resume/CL daily cap mismatch (edge 60/30 vs UI 20) | Resume/CL L1103 | Med: cost/abuse exposure, inconsistent limits | S | Decision with Savar (per memory) | No (edge redeploy) |
| 6 | `requestGroup` is a silent no-op; the modal "succeeds" | Community L460 | Med: the request quietly goes nowhere | M | Maybe (reuse the mobile email fn?) | No |
| 7 | Quota meter isn't invalidated when a charged turn fails to save | Resume/CL L1118 | Low | S | No | No |
| 8 | `translate-content` `.catch` on `PromiseLike` (latent refund-path throw) | CI L1050 | Low-Med: silent refund loss | S | No (web-owned fn) | No |
| 9 | Latent guards: `total_questions>0`, `getNews` without `nullsLast`, nullable `member_count` typed as `number` | Audit L258-267 | Low | S | No | No |
| 10 | Delete dead `LearningProgressSummary` chain (hook has no consumer, verified) | Services L758 | Low (tech debt) | S | No | No |
| 11 | Delete dead signed-out mock returns (8 services still have them) | Services L755 | Low | S | No | No |
| 12 | `useResourceFilters` loses one of two same-tick updates | Resources L996 | Low | S | No | No |
| 13 | Enable leaked-password protection (needs the Pro plan) | Security L697 | Med security | S | Yes (shared project) | Dashboard |
| 14 | `report-post` should map 23505 to "Already reported" | Audit L240 | Low-Med: stops duplicate moderator emails | S | **Yes** (mobile fn) | No |
| 15 | No `comment_count` sync trigger (drifts on ~73% of posts) | Audit F1 L249 | Low (UI reads the RPC count) | S | **Yes** | **Yes** |
| 16 | Search (posts/users/groups) | P8 L138 | Med: discovery | M | No (ilike) | Maybe RPC |
| 17 | Notifications (list, badge, write-on-action) | P7 L129 | Med-High: retention | L | **Yes** (shared table/triggers) | **Yes** |
| 18 | Apple Sign-In (no stub remains in the code) | G10 L296 | Med: iOS users | M | Yes (shared auth provider) | Dashboard |
| 19 | Rich text in posts (`PostCard` runs `stripHtml`) | G5 L291 | Low-Med | M | No | No |
| 20 | Tasks card on the section page | Learn L805 | Med | M | No | No |
| 21 | Broad anon `REVOKE` + re-grant | Security L691 | Med security | M | **Yes** | **Yes** |
| 22 | Full pre-launch security audit (done 2026-09; report kept private) | Security L694 | Med | M | No | No |
| 23 | `encodeMatch` stores display text, so content edits break answers | Learn L909 | Low-Med | M | **Yes** | **Yes** (answers migration) |
| 24 | Un-`@ts-nocheck` the edge fns (rag-query part needs Savar) | CI L1028 | Low | M | Partly | No |
| 25 | Investigate why web may show fewer modules than mobile | Learn L774 | Unknown | S | No | No |
| 26 | Companion chips don't refresh on tap (they are personalized) | G8 L294 | Low | S | No | No |
| 27 | `pinned_at` ordering | Feed L446 | Low | S | Yes | Yes |
| 28 | Other users' city/province (public-profile read path) | Profile L646 | Low | M | Yes | Yes |
| 29 | `news_details.image_link` NOT NULL + non-null TS type | Schema L748 | Low | S | Yes | Yes |
| 30 | Remove the hidden Circles tab outright | Nav L933 | Low | S | Product | No |
| 31 | Circles matching, realtime and chat (+ pool_key reconciliation) | P12 / L456 / L745 | Med (hidden feature) | L | Yes | Yes |
| 32 | Referrals | P13 L173 | Low | L | Yes | Yes |
| 33 | One shared partner source (Sanity type) | Resources L978 | Low | M-L | Yes | No |
| 34 | Resources: save-for-later, verified badge, facets, real logos | Resources L953/L987 | Low | M | Save needs Savar + DB | Save only |
| 35 | Content: publish 228 practice/quiz translation drafts, Savar heads-up on the Translations tab, "dependent child" fix, Identification quiz, P2/P3 typos, checklist→Community links | Learn L808-907, Checklist L684 | Low-Med | S each | Yes (publishing) | No |
| 36 | Crawler: bibliocommons/communico diagnostics, mosaic/burnaby logs, relevance near-misses | L494, L1089, L550 | Low | S | No | No |
| 37 | KB `ingest-documents` crawler dies with 546 | Audit L234 | Med (no new KB docs) | M | **Yes** (mobile-owned) | No |
| 38 | Events board analytics, BIMI, i18n-skill concurrency, streaming body cap, private-storage read scoping | L1096, L1007, L1070, L722, L733 | Low | S-M | No | No |

### Top 5 plans

**1. Empty checklist for `refugee`/`other`** (S, no DB, no Savar)
- Files: `services/checklist.ts` (GROQ `$persona in personas` at L52), maybe `lib/sanity.ts`.
- Approach: map each web persona to a set of Sanity tags and query with `count(personas[@ in $tags]) > 0`. For example, `refugee` maps to `refugee, protected_person, immigrant, pr`, and `other` maps to `immigrant, pr`. Also add an empty-state fallback.
- Before building: re-run the tag counts on `fercgabp/production`, since the 2026-05 numbers may be stale.
- Risk: whether refugees should see the generic immigrant/PR tasks is a product call. Flag it to Savar, but no sign-off is needed.

**2. Site URL repoint** (S, dashboard, Savar)
- Files: none in code. `supabase/email-templates/change-email.html` depends on `{{ .SiteURL }}`.
- Approach: set Site URL to the production web domain, and add the mobile deep-link scheme plus `localhost:3000` to Redirect URLs.
- Risk: mobile flows that use `{{ .SiteURL }}` would change, so check mobile's templates with Savar first. Confirm the current value before acting.

**3. Cover-letter import quota** (S, no DB). **Done in PR #152:** a separate `/api/cover-letter/job-posting` route gated on `cover_letter_usage`, instead of the body flag sketched below.
- Files: `app/api/resume/job-posting/route.ts` (hard-codes `resume_usage` at L118 and the limit 20), `lib/drafts/createDraftService.ts` (L331 fetch).
- Approach: send `feature` in the request body. The route selects `resume_usage` or `cover_letter_usage` (RLS select-own; table in `20260904120000_cover_letters.sql`) with the matching limit, and emits `trigger:"job_import"` with the right feature.
- Risk: the SSRF/size-cap path stays as it is. Ship after #5 or together with it, since #5 sets the limit values.

**4. URL-backed tabs** (S, no DB)
- Files: `app/(main)/home/page.tsx` (L50), `app/(main)/profile/page.tsx` (L157), `app/(main)/profile/[userId]/page.tsx` (L72), `app/(main)/profile/[userId]/followers/page.tsx` (L65-67). Reference: `app/(main)/community/page.tsx`.
- Approach: derive the tab from `?tab=` on every render, write it with `router.replace(..., {scroll:false})`, wrap in `<Suspense>`, and add the tab to any back `<Link>` hrefs.
- Risk: Home's infinite query is keyed per tab and has an IntersectionObserver, so check that the scroll position and the prefetch survive. One PR, or split by page.

**5. Resume/CL cap alignment** (S, edge redeploy, decision with Savar)
- Files: `supabase/functions/resume-chat/index.ts` (L39 = 60), `supabase/functions/cover-letter-chat/index.ts` (L39 = 30), `lib/resume/schema.ts` (L31 = 20), `lib/coverLetter/schema.ts` (L25 = 20), the job-posting route, and `prompt_limit` in analytics.
- Approach: pick one number per feature, make one constant the single source for the client, and redeploy both fns with `--use-api`.
- Risk: this is a production deploy to the shared project, and lowering the cap cuts current direct-API usage. Memory says the decision is pending between Luis and Savar.

### Stale / already shipped (update BACKLOG.md)
- **P4 block/report and feed block filtering**: `getBlockedUserIds` is used in `services/feed.ts`.
- **P9 saved/user/group posts**: real queries exist, and mock is only the unconfigured fallback.
- **P10 daily tips**: `services/dailyTip.ts`, `DailyTipCard`.
- **G1 i18n, G3 favourites** (`FavouriteButton` + `savedOnly`), **G4 lightbox** (`ImageLightbox`), **G7 confetti** (`TaskRow`), **G9 first-name greeting** (`learn/page.tsx` L227).
- **Infinite scroll**: `useInfiniteQuery` in `hooks/useFeed.ts`.
- **Delete account**: `DeleteAccountModal` + `services/auth.ts` `deleteAccount`.
- **i18n Phase 4b (Learn strings) and discussion Translate**: `microcopy.ts` returns keys, and `TranslateButton` is in the discussion components.
- **Submodule landing page**: the `[submoduleId]/page.tsx` route exists.
- **Nav reorder**: the order is already Learn→Checklist→Companion→…→Social.
- **Group member avatars**: `GroupMemberAvatarStack`, loaded from real data.
- **Optimistic count rollback**: the count is derived from the rolled-back `liked` flag, so it self-corrects.
- **Login/sidebar direct `createClient`**: neither file references supabase any more. This is also stale in CLAUDE.md "Pending Tasks".
- **int4/int8 cross-DB caveat**: moot since the single shared DB.
- **Phase 18 news seed apply**: superseded by the live news crawler (`20260619130000_news_details_crawler.sql`).
- **`rag-query` PostHog text** (L1123): recorded as intentional; not a task.
