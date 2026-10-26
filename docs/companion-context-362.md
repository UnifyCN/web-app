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
| `supabase/probes/companion-context-362` (local Supabase stack, real GoTrue JWTs, PostgREST, RLS, the real migration) | Per-account reads, a foreign or deleted conversation is denied, 401 before any read, simultaneous isolation, no writes to profile/tasks/messages, the column is owner-only and shape-checked | 7/7 pass. Mutations (service-role reads, keeping denied history, no shape check, a profile write on every read) each fail one test. A constant profile write was not caught until the snapshot covered every table. |
| `rag-query/fixtures/*.json` | The exact handler responses the web and mobile client tests consume. The handler test fails if they drift. | Pinned |
| `components/companion/companionContext.acceptance.test.ts` (real `useSendMessage`, `generateReply`, `saveMessage`, `getMessages`, `MessageBubble`; fetch, Supabase client and PostHog stubbed) | Saved context equals the handler's; the reopened answer shows place, arrival, task count, check time and the control; no context in analytics; seven locales; conflict and unavailable text; older server; unmigrated column | 8/8 pass. On baseline `8c9ecbf`: 5 fail on assertions, 3 pass (the compatibility and privacy guards). |
| `components/companion/CompanionContextDrawer.test.ts` (static render) | Pages with link, publisher, address and read time; profile, conversation and task sections; unavailable; Arabic; hostile text and non-https links | 7/7 pass |
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
- Drawer focus trap, Escape and focus return run in effects. Static rendering
  does not exercise them, and no browser run was made.
