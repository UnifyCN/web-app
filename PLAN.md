# Unify Web App — Frontend Build Execution Plan

## Context

This repo (`UnifyCN/web-app`) currently contains only `CLAUDE.md` and `README.md`. The
goal is to build the **frontend-only** Next.js 14 web app that mirrors the Unify mobile
app, per the spec in `CLAUDE.md`. No backend wiring, no real data, no auth — mock data
everywhere.

This plan breaks the work into sequential phases, one app section at a time. Every
section phase ends with an `/impeccable polish` + `/impeccable audit` gate; nothing
moves to the next phase until audit findings are fixed.

**Design rule (non-negotiable):** Layout/structure comes from the Figma file
(`https://www.figma.com/design/7kxyT3Ud3zqy6Fl68cK05v/Unify`, entry node `3701-3084`).
Colours, typography, and visual style come **only** from the mobile-app tokens in
`CLAUDE.md`. Never use a colour sampled from Figma.

**Environment facts (verified):**
- Active shell Node is v16.20.2 (too old). Node v22.22.2 is installed via nvm — every
  phase runs under `nvm use 22`. A `.nvmrc` pinning 22 is committed in Phase 2.
- Installed skills: `frontend-design`, `ui-ux-pro-max`. Missing: `impeccable`,
  `taste-skill`, `emil-design-eng`, `gstack` — installed in Phase 0.
- Figma MCP server (`https://mcp.figma.com/mcp`) is connected and authenticated.
- ui-ux-pro-max generator script confirmed at
  `~/.claude/skills/ui-ux-pro-max/scripts/search.py`.

---

## Phase 0 — Environment & Skills Setup

Goal: All tooling installed and verified before any code is written.

- Activate Node 22: `nvm use 22` (use for every subsequent command).
- Install the 4 missing skills, verifying each before continuing:
  - `npx skills add https://github.com/pbakaus/impeccable --agent claude-code`
  - `npx skills add https://github.com/Leonxlnx/taste-skill --agent claude-code`
  - `npx skills add https://github.com/emilkowalski/skill --skill emil-design-eng --agent claude-code`
  - `npx skills add https://github.com/garrytan/gstack --agent claude-code`
- Figma MCP server is already connected and authenticated.
- Files created: none.
- Gate: Each skill confirmed installed; any failure flagged in the run summary.

## Phase 1 — Design System Generation (run once)

Goal: Produce the persisted design-system source of truth.

- Run the ui-ux-pro-max generator and save output to `design-system/MASTER.md`.
- Files created: `design-system/MASTER.md`.
- Gate: MASTER.md exists; every later phase reads it before building components.

## Phase 2 — Project Scaffold

Goal: A running, empty Next.js 14 app.

- `npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias="@/*" --no-git --yes`
- `npm install @supabase/ssr @supabase/supabase-js @tanstack/react-query @tanstack/react-query-devtools @sanity/client lucide-react clsx tailwind-merge`
- Add `.nvmrc` (22), `.env.local.example` with the 4 env vars from CLAUDE.md.
- Gate: `npm run dev` boots clean; `npm run build` succeeds.

## Phase 3 — Design Tokens & Foundation

- `tailwind.config.ts` — full brand token set from CLAUDE.md.
- `app/globals.css` — CSS variables + shared component classes; Geist font wired.
- `lib/utils.ts` — `cn()` helper.
- `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/sanity.ts` — stubbed clients.
- `middleware.ts` — stubbed session-refresh passthrough.
- `types/index.ts` — Persona, stage system, entity types.
- Gate: `/impeccable audit`; `npm run build` passes.

## Phase 4 — Core UI Primitives

- `components/UnifyLogo.tsx`, `components/ui/{Avatar,Button,Badge,PriorityBadge,Card,Tabs}.tsx`.
- taste-skill dials: DESIGN_VARIANCE=6, MOTION_INTENSITY=3, VISUAL_DENSITY=7.
- Gate: `/impeccable polish` + `/impeccable audit`.

## Phase 5 — App Shell & Navigation

- `components/layout/Sidebar.tsx`, `app/(main)/layout.tsx`, `app/page.tsx`, route stubs.
- Gate: `/impeccable polish` + `/impeccable audit`; all 7 nav targets reachable.

## Phase 6 — Login

- `app/(auth)/login/page.tsx`, `app/(auth)/auth/callback/route.ts` (stub).
- Gate: `/impeccable polish` + `/impeccable audit`.

## Phase 7 — Home (3-column)

- `components/home/`: FeedTabs, PostCard, ComposeButton, RightPanel,
  LearningProgressWidget, NationalNewsWidget.
- `app/(main)/home/page.tsx`; `lib/mock/{posts,news,progress}.ts`.
- Gate: `/impeccable polish` + `/impeccable audit`.

## Phase 8 — Community

- `components/community/`: GroupCard, MyGroupsStrip, EventCard, NewsArticleItem, CirclesEntryCard.
- `app/(main)/community/page.tsx`, `[groupId]/page.tsx`; `lib/mock/{groups,events,circles}.ts`.
- Gate: `/impeccable polish` + `/impeccable audit`.

## Phase 9 — Companion (chat)

- `components/companion/`: ConversationList, ChatPanel, MessageBubble, ChatInput,
  StarterPromptChips, FreeTierIndicator.
- `app/(main)/companion/page.tsx`; `lib/mock/conversations.ts`.
- Gate: `/impeccable polish` + `/impeccable audit`.

## Phase 10 — Checklist

- `components/checklist/`: OverallProgressBar, PrioritySection, TaskRow, AddCustomTask, DeleteTaskModal.
- `app/(main)/checklist/page.tsx`; `lib/mock/tasks.ts` (serves as the env-not-configured fallback).
- Wired: `services/checklist.ts` (Sanity `checklist` GROQ filtered by persona + stage, merged with `user_tasks` + `custom_checklist_tasks`) + `hooks/useChecklist.ts`. Follows the Community/Learn pattern.
- Gap closures: optimistic toggle (`useToggleTask`), custom-task delete (`deleteCustomTask` / `useDeleteCustomTask` + trash control + confirm modal), "Learn how" deep links (`resolveLearnHowHref`: `link_tab` → submodule → module → `/learn`).
- Known: persona-tag mismatch with Sanity content — see `BACKLOG.md` → Checklist.
- Gate: `/impeccable polish` + `/impeccable audit`.

## Phase 11 — Learn

- `components/learn/`: ModuleHeroCard, ModuleCard, Breadcrumb, SubmoduleList, LessonList.
- `app/(main)/learn/page.tsx`, `[moduleId]/page.tsx`; `lib/mock/modules.ts`.
- Gate: `/impeccable polish` + `/impeccable audit`.

## Phase 12 — Profile

- `components/profile/`: ProfileHeader, StatsRow, PersonaBadge, StageIndicator, ProfileTabs.
- `app/(main)/profile/page.tsx`, `[userId]/page.tsx`; `lib/mock/users.ts`.
- Gate: `/impeccable polish` + `/impeccable audit`.

## Phase 13 — Service & Hook Stubs

- `services/` — stubbed query functions per Supabase schema.
- `hooks/` — matching React Query v5 hooks; QueryClient provider in root layout.
- Gate: `/impeccable audit`; `npm run build` passes.

## Phase 14 — Final QA

- `/impeccable audit` on every section page; fix all findings.
- gstack `/design-review`; fix any score below 7/10.
- Verify token compliance: no non-token hex values; Geist only.
- Gate: All audits clean, all design-review scores ≥7.

---

## Open Items to Flag Before Backend Wiring

- Confirm which Figma frames map to each section (only entry node 3701-3084 given).
- Real Supabase/Sanity env values needed before any data wiring.
- Auth flow (Google → Apple SSO) deferred per CLAUDE.md.

---

# Backend Wiring Phases

After the frontend build closed out (Phase 14), wiring is happening one section
per PR against the live web-app Supabase project. Each phase follows the
Community wiring pattern (`services/community.ts` + `hooks/useCommunity.ts`):
`isSupabaseConfigured()` guard, snake_case row mappers, React Query hooks with
stable keys + `onSuccess` invalidation. Earlier wiring phases (Auth, Profile,
Home/Feed, Community) are tracked in their PR descriptions; the current entries
below pick up at Companion.

## Phase 6 — Companion (persistence)

**Status:** ✅ Merged — PR #7 (`feat: wire companion to Supabase persistence`).

Wired `/companion` to real Supabase `conversations` / `messages` /
`chatbot_usage` tables. Service layer mirrors the Community pattern;
`useSendMessage` orchestrates create → optimistic user bubble → save user →
~900ms canned reply → save assistant → invalidate. Schema already migrated in
`supabase/migrations/20260518100300_companion.sql` (own-row RLS, cascade on
delete, trigger to bump `conversations.updated_at`).

### Phase 6 add-on — Conversation delete

**Status:** ✅ Merged — PR #8 (`feat: add conversation delete to Companion`).

Includes:

- Hover `•••` ellipsis menu per row, popover with a Delete item.
- Confirm modal (destructive variant) matching the Unify design system.
- Optimistic delete with rollback on error (`useDeleteConversation`).
- Portal clipping fix — `RowMenu` sub-component renders via
  `createPortal(…, document.body)` with position recomputed on scroll/resize
  (capture phase) so the popover isn't clipped by the sidebar's
  `overflow-y-auto`.
- Focus trap in the delete modal — auto-focus Cancel on open, Tab cycles
  between Cancel and Delete only.
- Stale delete detection — `deleteConversation` chains `.select()` and throws
  on zero affected rows (cross-device "already deleted" surfaces as an error
  so the optimistic remove rolls back instead of silently sticking).
- Message stream widened: `ChatPanel` `max-w-2xl` → `max-w-4xl`
  (preview-driven; bubbles read better on wide viewports).
- Sidebar 240px — preview-driven adjustment from the original 280px.

### Key technical decisions — Phase 6

- **Rate limit deferred to Phase 6.5.** No client-side increment shipped;
  `chatbot_usage` is read-only for display via `useChatbotUsage`. Atomic
  `check_and_increment_chatbot_usage` RPC will land in 6.5 to enforce daily
  caps server-side (matches mobile's `rag-query` pattern).
- **AI generation deferred to Phase 6.5.** Blocked on Savar providing the
  Gemini API key. Phase 6 ships persistence + a `CANNED_REPLY` stand-in in
  `useSendMessage`. When the key lands, replace the `setTimeout` + canned
  string with a Next.js route-handler streaming call (or port mobile's
  `rag-query` edge function).
- **Sidebar 240px (deliberate override).** CLAUDE.md originally specified
  ~280px; preview showed the sidebar overpowering the chat panel. Spec
  updated to ~240px in commit `c0de382`. Documented for future readers so
  the override doesn't get "fixed back" to spec.

## Phase 6.5 — Companion AI + rate limit (next, blocked on Gemini key)

Awaiting Savar's Gemini API key. When unblocked:

- Add `app/api/companion/route.ts` Next.js route handler streaming from
  Gemini (or port the mobile `rag-query` edge function for full RAG parity).
- Replace `CANNED_REPLY` in `useSendMessage` with an SSE consumer; persist
  the streamed assistant text + sources via the existing `saveMessage`.
- Migration: add `check_and_increment_chatbot_usage(p_user_id, p_daily_limit)`
  RPC (security-definer) and optional `total_tokens_used` /
  `total_estimated_cost_usd` columns on `chatbot_usage`.
- Call the RPC before each send; flip `FreeTierIndicator` from cosmetic to
  enforced. Surface a 429 toast/inline message when the limit hits.

## Phase 7 — Learn (after 6.5)

Wire the Learn section end-to-end:
- Sanity content (modules, submodules, lessons + full lesson body via
  `@portabletext/react`).
- Supabase progress (`learn_progress`, `user_lesson_progress`) + a new
  `learn_favourites` table for the heart-icon UI.
- Drop the hardcoded `OBJECTIVES` / `KEY_TERMS` placeholders on the lesson
  detail page — Sanity has no fields for them (verified 0/199 lessons).
- Personalization, quizzes/practices/tasks, page-by-page resume, activity
  pages, and highlights UI are out of scope for this phase.
