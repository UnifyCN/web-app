# Companion context and official guidance (ticket #362)

Spec: UnifyCN/mobile-app#359. Ticket: UnifyCN/mobile-app#362. Reads only. No
task write, proposal or action is part of this ticket (that is #363 onward).

## What changed

- `rag-query` runs a fixed read plan per answer (`lib/context/`): profile,
  Checklist, the caller's own conversation, knowledge-base retrieval and, for
  planning or fact-check questions, external official guidance. Reads use the
  caller's JWT client, so row-level security decides access. There are no
  per-read prompts and no service-role reads of user data.
- The answer returns a version-1 `context` object (JSON body and streamed
  `metadata` event) with stable ids and revisions for the later planning
  boundary, the official pages read (URL, registry publisher, the time this
  server read them) and any clarification needed.
- Details stated in a conversation are used for that answer only. They are
  never written to the profile or saved personal details, and later
  conversations do not inherit them.
- Guidance search uses the existing OpenRouter key (web plugin, Exa engine,
  `include_domains` limited to Canadian government domains, at most 3 results).
  Pages are fetched here with https only, a public-address check, redirects
  re-checked per hop, time and size limits. Page text goes to the model only
  as quoted data. Every failure is a typed `unavailable` status. No check time
  is ever invented.
- Web client: a context line under each answer and a "Sources and context"
  overlay drawer (inline-end, full width on narrow screens). It is saved with
  the answer in `messages.companion_context` (additive, nullable, shape-checked
  migration `20261026120000`) and never sent to analytics. Strings are
  translated in all seven locales.

## Evidence (local only, 2026-10-25)

| Layer | What it proves | Result |
| --- | --- | --- |
| `index_companion_context_test.ts` (Deno, real handler, controlled Supabase/Sanity/OpenRouter/page fixtures) | Vancouver answer with ids, revisions and check times; stream and JSON parity; analytics carry no context; malicious page and task text; private-address and off-list URLs; unavailable, conflict and missing cases; denied conversation; invalid JWT; two simultaneous accounts; no inherited details | 15/15 pass |
| Same test on unchanged baseline `8c9ecbf` (test, fixtures and test harness copied in) | Regression | 14 fail on `AssertionError` (missing context), 1 pass (invalid JWT was already rejected) |
| `supabase/probes/companion-context-362` (local Supabase stack, real GoTrue JWTs, PostgREST, RLS, the real migration) | Per-account reads, a foreign or deleted conversation is denied, 401 before any read, simultaneous isolation, no writes to profile/tasks/messages, the column is owner-only and shape-checked | 7/7 pass. Mutations: service-role reads, keeping denied history and no shape check each failed one test. A profile write on every read was caught only when the value changed on each read. **Correction (review r1):** an earlier version of this row said the constant profile write was caught after the snapshot covered every table. That was wrong: `/tmp/unify-context-362/rls-mutations.txt` shows the constant write exit 0 both before and after that change. Rows that stay equal do not prove that no write was attempted. See "Review corrections" for the write-attempt audit that now catches it. |
| `rag-query/fixtures/*.json` | The exact handler responses the web and mobile client tests consume. The handler test fails if they drift. | Pinned |
| `components/companion/companionContext.acceptance.test.ts` (real `useSendMessage`, `generateReply`, `saveMessage`, `getMessages`, `MessageBubble`; fetch, Supabase client and PostHog stubbed) | Saved context equals the handler's; the reopened answer shows place, arrival, task count, check time and the control; no context in analytics; seven locales; conflict and unavailable text; older server; unmigrated column | 8/8 pass. On baseline `8c9ecbf`: 5 fail on assertions, 3 pass (the compatibility and privacy guards). |
| `components/companion/CompanionContextDrawer.test.ts` (static render of the panel) | Pages with link, publisher, address and read time; profile, conversation and task sections; unavailable; Arabic; hostile text and non-https links | 7/7 pass |
| Full `vitest run`, `tsc --noEmit`, eslint on changed files, `check-i18n`, `next build` | | pass |

UI mutations (each reverted): not saving the context fails 5 tests, dropping it
on reopen fails 4, removing the publisher fails 1, removing the province
conflict notice fails 1, allowing any link scheme fails 1. Forcing a check time
on a failed page in the parser is not observable: the drawer and `latestCheck`
also require `status === "checked"`.

The client acceptance test caught a real defect: `Intl.DateTimeFormat` throws
when `dateStyle`/`timeStyle` are combined with `timeZoneName`, which would have
broken every answer with checked pages.

## Order of work (TDD honesty)

The handler, the probe, the client parser and the web UI were written before
their tests in an earlier session. Their tests were not test-first. Regression
was then shown by running the tests on the unchanged baseline and seeing
assertion failures. The web acceptance and drawer tests were also written after
the web UI. The mobile acceptance test was written first and failed on
assertions before the mobile implementation existed.

## Not proven here

- Nothing ran against the hosted project. The migration is not applied there.
  Until it is, both clients save and read answers without the column (tested
  fallback).
- No live search or live page read was run. All provider behaviour is from
  controlled fixtures. The OpenRouter request shape matches the current docs
  (openrouter.ai/docs/guides/features/plugins/web-search, read 2026-10-25),
  but the hosted key's access to the web plugin is unverified.
- Cost: each guidance search is billed to the existing OpenRouter credits
  (Exa, about $0.007 per request at the time of reading), only for planning
  and fact-check questions. `COMPANION_GUIDANCE_SEARCH=off` turns it off, and
  answers then say guidance could not be checked.
- The `/api/companion` proxy passes the body through unchanged. It was not
  exercised by these tests.
- The drawer browser check runs in headless Chromium only, with the data
  hooks replaced by fixtures. It does not prove login, cookies, Safari,
  Firefox, screen-reader output or a deployed build.

## Review corrections (2026-10-25)

Branch `fix/companion-context-362-corrections`, from candidate `b59ef86`.
Reviews: standards r1 (3 findings) and spec r1 (6 findings, one on mobile).
Each new test below was written before its fix and run on the unchanged
candidate first. The RED results are assertion failures, not crashes.

| Finding | Change | Test and result |
| --- | --- | --- |
| Spec 2: a denied conversation still gave stated details from its earlier turns | Earlier turns count only when the conversation read is not denied (context, prompt and search). Round 1 was partial: a failed lookup still counted as permission (spec r2 finding 1, fixed in round 2) | Handler test "a denied conversation: details from its earlier turns..." with an own-conversation control. RED on `b59ef86`, GREEN now |
| Spec 3: Checklist context ignored the province | Same rule as the mobile Checklist: a task with a province shows only in that province, no province means national. GROQ filter plus a server-side check | Handler test "Checklist context follows the Checklist's province rule" (BC and Ontario accounts). RED, GREEN |
| Spec 4: es/ar/hi/pa/vi planning questions made no guidance search | Planning questions are matched from one word list per supported language (en, fr, es, ar, hi, pa, vi, romanised Hindi/Punjabi), all checked on each question | Handler test: 21 planning questions (17 in single languages, 2 or 3 per language, plus 4 mixed-language) must search once and return `checked`; 6 definition questions must not search. RED (18 of 21 missed), GREEN |
| Standards 1: source titles, addresses and the details control below 4.5:1 | New scoped token `context-link` `#2b5a9b` (the mobile value; 6.06:1 on `surface-gray`, 6.91:1 on `surface`), addresses `ink-muted` (5.13:1). Added to `design-system/MASTER.md` | Browser check measures every visible text run of the context line and drawer against its actual background, in English and Arabic. RED (3.52, 2.37, 4.02), GREEN |
| Standards 3: drawer had no enter/exit motion | Drawer uses `DialogPresence`, `DialogOverlay` and `DialogPanel` from `components/ui/Dialog.tsx` | Browser check samples the panel each frame: it fades and moves in, fades out before removal, and under reduced motion never moves gradually. RED, GREEN |
| Spec 5: a parent update moved focus from a source link to Close | Focus and key handling depend on `open` only; the latest `onClose` is read from a ref | Browser check: focus a link, update the same account, focus stays on the link. RED, GREEN |
| Spec 1: an open drawer kept account A's context after an account change or access loss | The drawer shows an answer only while it is in the current conversation. The Companion page remounts the chat panel when the signed-in account changes (not on first load), and clears the open conversation | Browser check on the actual page: account change closes the drawer, shows none of A's context and clears A's draft; access loss closes the drawer and keeps the same account's draft. RED, GREEN |
| Standards 2: evidence overstated the constant-write mutation | Evidence row corrected above. Probe-only migration `supabase/probes/companion-context-362/supabase/migrations/20260101000001_probe_write_audit.sql` records every INSERT/UPDATE/DELETE statement on the profile, task, conversation and message tables. Each answer in the probe must make none; a control write proves the audit sees an unchanged-value update | Constant profile write: exit 0 with the row snapshot only (reproduced), exit 1 with the audit. Changing write: exit 1 in both |

Runs on this branch (local, 2026-10-25):

- `deno test ... supabase/functions/rag-query/`: 143 passed. The handler
  file has 18 tests. The spec reviewer's six reproduction tests, copied in
  temporarily, also pass (3 were the failing reproductions).
- `node scripts/verify-companion-context-drawer.mjs` (`npm run
  test:companion-drawer`): 25 passed. The same script on `b59ef86`: 12
  failed, 13 passed, 0 errors. The first RED run also failed "focus returns
  to the Sources and context control". That was a fault in the test (a
  scripted click does not focus the button, a pointer click does). After the
  fix to the test, that check passes on `b59ef86` too, so it is not claimed
  as a regression.
- Probe on a separate local stack (`PROBE_PROJECT_ID=unify-context-362-corrections
  PROBE_PORT_BASE=59671 ./run.sh`): 8 passed.
- `vitest run` 556 passed, `tsc --noEmit`, eslint on changed files,
  `check-i18n`: pass.

Proof classes stay separate. Handler tests use controlled Supabase, Sanity,
OpenRouter and page fixtures. The probe uses a real local Supabase stack with
fixture providers. The browser check uses the actual page and components with
fixture data hooks. Nothing ran against the hosted project, a live search or
page, a signed-in browser session or a native device.

Limits of the corrections:

- Language matching covers the listed phrasings, not every way to ask in each
  language. At round 1, stated city, province and arrival time were still read
  from English and Latin-script names only, and in other scripts the profile
  was used. Spec review r2 rejected this (finding 2); see round 2.
- Under reduced motion, the shared dialog motion holds the start transform
  for the first one or two frames while the panel is nearly transparent, then
  shows the panel in place. This is the same for every dialog that uses
  `components/ui/Dialog.tsx`.
- The Checklist province rule matches mobile. The web Checklist page itself
  (`services/checklist.ts`) does not filter by province; that is outside this
  ticket.

## Review corrections, round 2 (2026-10-25)

Spec review r2 rejected three cases on `c861862`. Each new test was written
first and run on the unchanged code. The RED results are assertion failures.

| Finding | Change | Test and result |
| --- | --- | --- |
| r2-1 (P1): a conversation lookup that failed (503, network) still let the client's earlier turns into the context, the model prompt and the search | Earlier turns count only when this account's conversation read returns `ok`. Denied, failed, timed-out and missing reads are not permission. The current message still counts. Eval mode (secret-gated, no account) is unchanged | Handler tests: lookup 503 and network failure, each with a current-message control; no conversation id. Local probe on real GoTrue JWTs and RLS with only the ownership lookup replaced by a 503 (fault injection). All RED on `c861862`, GREEN now |
| r2-2 (P2): Toronto stated in Arabic, Hindi or Punjabi kept the saved BC province, searched for BC, excluded the Ontario page and asked nothing | `lib/context/placeNames.ts` reads the 31 listed Canadian cities and 13 provinces/territories in Arabic, Devanagari and Gurmukhi script (spelling variants folded: vowel and nasal marks, nukta, alef forms, Arabic prefixes), French and Spanish province names, and arrival times (tomorrow, this/next week, next month, "in N days/weeks") per supported language. A stated destination then drives the search province and the province clarification, as in English | Handler tests: Toronto next week in en, fr, es, ar (3 spellings), hi (2), pa (2), vi and 3 mixed-language questions; Ontario and BC named in 8 language/script forms; control: Vancouver in ar/hi/pa asks nothing. RED (13 of 14 Toronto cases wrong; fr, es and vi only on the arrival time; all 8 named provinces wrong; the Vancouver control failed), GREEN |
| r2-3 (P2): the open drawer trapped Tab but left the composer and search focusable and in the accessibility tree | `DialogPresence` (`components/ui/Dialog.tsx`) takes `inertBackground`. While open, every other `<body>` child is `inert`, including ones added meanwhile; a later dialog layer is not. Holds are counted per element and each element's earlier `inert` value is restored on close or unmount. The drawer turns it on | Browser checks: script focus on the composer and search stays in the drawer; Chromium's accessibility tree (CDP `Accessibility.getFullAXTree`) has neither; same after a same-account update; in Arabic. After close: both take focus and are back in the tree, the draft is kept, and an element the app had made inert stays inert. RED 4 failed on `c861862`, GREEN 33/33 |

Runs on this branch (local, 2026-10-25):

- `deno test ... supabase/functions/rag-query/`: 151 passed (handler file 23
  tests, `placeNames_test.ts` 3). The spec reviewer's r1 and r2 handler
  reproductions, copied in temporarily, pass (8).
- Probe on a separate local stack (`PROBE_PROJECT_ID=unify-context-362-corrections
  PROBE_PORT_BASE=59671 ./run.sh`): 9 passed, including the fault-injection
  test; it failed 1 of 9 with the round-1 access code.
- `npm run test:companion-drawer`: 33 passed. The reviewer's independent
  inert-background script also passes against this branch (served on port
  3012, output kept outside the review evidence folder).
- `vitest run` 556 passed, `tsc --noEmit`, eslint on changed files,
  `check-i18n`, `next build`: pass. `deno check` passes for the changed
  context modules after a type-only fix to the existing empty-context
  fallback (`08c558f`).

Order of work: the handler, probe and browser tests above were written and
run RED before their fixes. `placeNames_test.ts` (words that must not match)
was written after `placeNames.ts`.

Proof classes: handler tests use controlled Supabase, Sanity, OpenRouter and
page fixtures. The probe uses a real local stack; its 503 is injected, not an
observed outage. The browser checks use the actual page and components with
fixture data hooks, in headless Chromium only. Nothing ran against the hosted
project, a live search or page, or a native device.

Limits of round 2:

- Place recognition covers the listed cities and provinces and their listed
  spellings. Other places, and other spellings that folding does not join,
  produce no detail, and the answer then uses the saved province, as in
  English. Arrival times in Hindi and Punjabi do not use "kal" (it means both
  yesterday and tomorrow), so "kal" gives no arrival time.
- `inertBackground` is used only by this drawer. Other dialogs keep their
  earlier behaviour (they now render inside a `display: contents` layer).
  Nested dialogs and elements added while open follow the counted holds; no
  test opens a second dialog over the drawer.
- Chromium's accessibility tree is the evidence for "not exposed". No
  screen reader (VoiceOver, NVDA, TalkBack) was observed.

## Review corrections, round 3 (2026-10-25)

Spec review r3 on `805689c` left one ticket finding and recorded one shared
dialog regression. They are separate below. Each new test was written first
and failed on assertions against `805689c` before the fix.

### Ticket finding: the origin won over the stated destination

`placeIn` returned the first city in table order, so "moving from Vancouver to
Toronto" used Vancouver (BC), searched for BC, excluded the Ontario page and
asked nothing.

Change (`lib/context/placeNames.ts`, `conversationDetails.ts`, `contract.ts`,
`promptBlocks.ts`): every place mention is found with its position, and gets a
role from the words right around it in each supported language: origin
("from", "de", "desde", "من", "từ", Hindi "से", Punjabi "ਤੋਂ"), past or current
residence, family or visit ("my sister lives in", "visit"), destination ("to",
"à", "a", "إلى", the "li-" prefix, "đến", "पहुँच"/"शिफ्ट"/"में" after the name,
Punjabi equivalents), or none. Places joined by "or" share one role. The
destination is chosen by role: marked destinations, else places with no role,
else where the user lives now. Origins and family/visit places are never
chosen. When the chosen places are in two or more provinces, the context gets
a new clarification `{ kind: "place_unclear", field: "province", options }`:
the saved province is not used for the search, and the prompt tells the model
to ask which place applies and give only Canada-wide steps until then. The
current message still comes before earlier turns, and an unclear current
message is not replaced by a clearer earlier one.

Case range bound at the handler (`index_companion_context_test.ts`):

| Cases | Expected | On `805689c` | Now |
| --- | --- | --- | --- |
| 17 "to Toronto" cases: from A to B, to B from A, currently A moving B, lived in A arriving B, fr/es/ar/hi/pa/vi routes, 3 mixed-script routes, family in Calgary (en, ar, hi), visit Montreal | Toronto/Ontario, Ontario search and page, province clarification | 13 used Vancouver (the 4 family/visit cases passed only because of table order) | pass |
| Reversed routes and "my brother lives in Toronto" for a BC profile (en, hi, ar); reversed route for an Ontario profile | BC with no clarification; BC conflict for the Ontario profile | passed (table order) | pass (by role) |
| 5 two-destination messages (en x2, fr, hi, ar) | `place_unclear` with Ontario and Alberta, no province, no BC search, no page excluded for a guessed province, prompt asks | fail | pass |
| Current vs earlier turns; unclear current over clear earlier; origin only | current wins; unclear asks; origin alone gives no province | fail | pass |

The spec reviewer's r1, r2 and r3 handler reproductions (18 tests), copied in
temporarily, pass.

Clients: a pinned handler fixture `rag-query-context-place-unclear.json`
(drift-checked by the handler test) feeds new web drawer and mobile sheet
tests. Both failed on the unchanged parsers (the clarification was dropped)
and now show "You named more than one place you may be going to: Ontario,
Alberta. Companion asked which one applies." New key
`companion.context.clarifyPlace` in all seven locales in both repos.

### Shared dialog regression (bounded, not a ticket blocker)

A `ConfirmModal` or inert-background `DialogPresence` mounted closed before
the drawer opened stayed inert when opened above it: the round-2 hold covered
every existing layer. No current Sources control opens this nesting.

Change (`components/ui/Dialog.tsx`): one registry of mounted dialog layers.
Each change recomputes the inert set in one pass: the latest-opened dialog
with `inertBackground`, and every dialog opened after it, stay usable;
everything else in `<body>` (including closed layers and earlier dialogs) is
inert, and each element gets back its own earlier `inert` value when
released. A body observer covers children added while a dialog holds the page.

Browser check (`npm run test:companion-drawer`, now 50 checks): for a
`ConfirmModal` mounted closed, an inert `DialogPresence` mounted closed, and
one mounted on opening, each opened above the drawer must take focus, be in
Chromium's accessibility tree, keep the page behind inert, and give focus
back to the drawer when closed; the drawer closing first under an open upper
dialog; a body child added while open; and after all close, only the element
the app made inert stays inert. On `805689c`: 4 failed (the two mounted-closed
cases). Now 50/50. The reviewer's r3 browser script (29 checks), served on
port 3012 with output kept outside the review folder, also passes.

### Runs on this branch (local, 2026-10-25)

- `deno test ... supabase/functions/rag-query/`: 156 passed.
- Probe on my own stack (`unify-context-362-corrections`, ports 59671-59673):
  9 passed; stack stopped afterwards.
- `vitest run` 557, `tsc --noEmit`, eslint on changed files, `check-i18n`,
  `next build`, `deno check` on the changed context modules: pass.

Order of work: all tests above were written before their fixes. One test was
corrected before the fix: the first RED run's "mounted on opening ... in the
accessibility tree" check counted both the button and its text node; it now
looks for the button role (that check passes on `805689c`, so it is not
claimed as a regression). `placeNames_test.ts` was updated for the new return
shape.

Limits of round 3:

- Roles come from fixed word lists next to the place name. They cover the
  listed sentence shapes in each language, not every way to say where you
  are going. A sentence the lists do not cover falls back to "places with no
  role"; if those are in two provinces, Companion asks.
- Hindi/Punjabi "kal" still gives no arrival time.
- The shared dialog registry is exercised in Chromium with the actual
  components and fixture data hooks. No screen reader was observed, and no
  Safari or Firefox run was made.
- Proof classes stay separate: handler tests (fixture providers), local
  probe (real local auth and RLS), browser (actual components, fixture
  hooks). No hosted, live-provider or native run.
