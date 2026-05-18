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

- `components/checklist/`: OverallProgressBar, PrioritySection, TaskRow, AddCustomTask.
- `app/(main)/checklist/page.tsx`; `lib/mock/tasks.ts`.
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
