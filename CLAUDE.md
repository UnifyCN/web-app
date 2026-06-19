# Unify Web App — Project Spec for Claude Code

## What is this?

Unify is a newcomer support platform for people settling in Canada. This is the **web app** — a React/Next.js frontend that mirrors the features of an existing React Native mobile app. We are building the **frontend only** first. No backend wiring until the UI is complete.

The mobile app repo (read-only reference) is at `github.com/UnifyCN/mobile-app`.

## Build Status

The frontend is complete on mock data. **Supabase integration is underway** on the
**shared production DB `wrbauxutkysljmsqojts`** (web + mobile on one database since the
**PR #31 DB cutover**; the original web-only project `pbiszrycmcxmzxrnkkwr` is retired):

> **Supabase MCP access (two servers, both read-only).** Since the **PR #31 DB cutover**,
> the web app's canonical production DB is the **shared** project `wrbauxutkysljmsqojts`
> (web + mobile on one database). Two MCP servers are configured (tokens in
> `~/.claude.json`, not committed): `supabase-mobile` → the **live shared DB**
> `wrbauxutkysljmsqojts` — use this to inspect the real web+mobile schema/data — and
> `supabase` → the **retired** original web-only project `pbiszrycmcxmzxrnkkwr`, kept for
> historical schema reference only (no longer used by the app). Both run with
> `--read-only`; the shared DB has **live mobile + web users**, so never run destructive
> writes against it. After adding/changing MCP servers, restart Claude Code so the tools
> reload.

- **Auth — Google SSO + email/password are wired and working.** Google login runs
  `signInWithOAuth`; `app/(auth)/auth/callback/route.ts` exchanges the code for a session.
  **Email/password (PR #33)** adds a full mobile-parity flow in `app/(auth)/` — welcome
  carousel → signup / login / verify-email (6-digit OTP) / forgot-password / reset-password /
  before-you-continue (legal-consent gate) — backed by `services/auth.ts` (`signUp` /
  `verifyOtp` / `resend` / `resetPassword` / `updateUser` + consent stamping), with signup
  password-strength / common-password / email-typo validation and a Caps-Lock + eye-toggle on
  login. `proxy.ts` allows the public auth paths, refreshes the session, redirects signed-out
  traffic to `/welcome`, and runs a terminal consent gate before the onboarding gate; sign-out
  lives in Settings (and the sidebar). The browser client is a singleton
  (`lib/supabase/client.ts`) to avoid multiple GoTrueClient instances.
- **Database — schema lives in `supabase/migrations/`** (the web-app's own schema,
  separate from the mobile back-end), with **RLS enabled and own-row policies** on
  every table, plus a grants migration restoring public-schema API-role access.
- **Profile, Home/Feed, Community, and Companion are wired to real Supabase data.**
  Each follows the Community wiring pattern (`services/community.ts` +
  `hooks/useCommunity.ts`): `isSupabaseConfigured()` + `getAuthUserId()` guards,
  snake_case row mappers, mock fallback for the local-dev / env-not-configured
  case (no Supabase env vars), React Query hooks with stable query keys and
  `onSuccess` invalidation.
  The `public.users` row is bootstrapped app-side by `lib/supabase/ensureUserRow.ts`
  (in the OAuth callback and as a self-heal in `getCurrentUser`).
- **Checklist and Learn are wired to Sanity content + Supabase progress.**
  Checklist filters Sanity `checklist` docs by the user's persona + stage,
  buckets them into the 4 priorities, and tracks per-user completion in
  `user_tasks` (upsert-on-complete / update-on-uncomplete) plus user-created
  `custom_checklist_tasks`; each task's "Learn how" link resolves from the
  doc's `link_tab` / `submodule` / `module`. Learn (Phase 7) renders Sanity
  modules/submodules/lessons with Supabase progress, including the lesson
  detail page. Both follow the Community wiring pattern. See `PLAN.md` for the
  phase-by-phase build record.
- **Community Circles (PR #13)** — the Circles tab is wired to its status +
  waitlist join/leave on the mobile-mirrored schema (`community_match_waitlist`,
  `community_circles`, `community_circle_members`, `community_messages`). The
  EntryCard moves through default → waiting → in_circle. (Matching engine,
  realtime, and circle chat remain deferred — see `BACKLOG.md`.)
- **Navigation (PR #14)** — the sidebar mirrors the mobile nav order + icons, and
  the Circles tab is hidden to match the mobile launch navigation.
- **Companion AI (PR #15 + PR #20) — fully wired to the UI.** The `rag-query`
  **Supabase Edge Function** (Deno) is deployed and `useSendMessage` now streams the
  real RAG answer + sources (the canned reply is gone). The KB is seeded (32 docs /
  350 chunks, 1536-dim) with RLS + grants. **Both embeddings and the chat completion
  go through OpenRouter** — the query vector uses `openai/text-embedding-3-small`
  *proxied via OpenRouter* (`OPENROUTER_EMBEDDING_MODEL`), and answers run the shared
  Gemini-2.5-Flash → DeepSeek-v4-Flash fallback chain (`_shared/openrouter.ts`). This
  means the old broken `OPENAI_API_KEY` is **no longer a blocker** — only
  `OPENROUTER_API_KEY` is required. A daily rate-limit RPC caps usage at **6
  messages/day** (`check_and_increment_chatbot_usage`) and refunds the quota on
  failure (`decrement_chatbot_usage`). PR #20 also dropped the blue squiggly
  background, redesigned the conversation sidebar, and surfaces AI "suggested next
  steps" in the message bubble (`messages.suggested_next_steps`).
- **Learn + Practice (PR #16)** — section page
  redesign (Learn + Practice timeline cards in the module's colour); lesson
  pagination (`components/learn/LessonPager.tsx`); custom Sanity content-block
  renderers in `components/learn/PortableTextRenderer.tsx` (`example_box`,
  `tip_box`, `note_box`, `dropdown`, `image`, `checklist_checkbox`); a section
  Practice quiz route backed by `components/learn/practice/flattenPractices.ts`;
  lesson Quick Checks (`components/learn/practice/LessonQuiz.tsx`); the
  `user_practice_progress` + `user_lesson_quiz_progress` tables (migrations
  applied). Lessons with a Quick Check complete when the user presses Done on the
  quiz, and lessons without one complete when the user presses "Back to section"
  on the last content page; the Practice card shows the last score with a Retake
  button, completed timeline cards keep the module colour, and Back resets the
  current question for a fresh attempt.
- **Practice AI feedback (PR #21)** — free-text practice answers
  (`long_answer` / `short_answer`) are graded by the `practice-feedback` **edge
  function** (Deno, DeepSeek-v4-Flash via the shared OpenRouter chain), surfaced in
  `components/learn/practice/PracticeFeedbackModal.tsx`. No OpenAI dependency.
- **Post detail + comments (PR #19) — P2 done.** `app/(main)/post/[postId]/page.tsx`
  renders the full post plus **threaded comments with replies** (`parent_comment_id`,
  reply-to pill). Comment services live in `services/feed.ts`
  (`getComments` / `createComment` / `deleteComment` / `likeComment` /
  `unlikeComment`) with hooks in `hooks/useFeed.ts`; the comment-count badge links
  into the detail page. The `post_comments` table has own-row RLS + a count-sync
  trigger.
- **Onboarding — 11-step mobile-parity wizard (PR #22).** `components/onboarding/`
  now mirrors the mobile flow: name (first name) → persona → referral source →
  arrival date → location → goals → learning interests → hobbies → learning
  reminders → outcome preview → confirmation. New columns
  (`first_name`, `referral_source`, `hobbies[]`, `learning_reminders`) landed via
  `20260605120000_onboarding_extra_fields.sql`. `OnboardingEditModal` reuses the same
  flow in "edit" mode from the profile header.
- **Learn — complete section (PR #28).** The Learn experience is feature-complete:
  text-selection **highlights** + **Ask AI** (the `explain-term` edge function, word-level
  selectable lesson content), deep whole-word **search** across module/submodule/lesson
  titles, **Framer Motion** animations (submodule row expansion, expand/collapse), a
  **sticky filter sidebar** (stage filter, "Recommended for you", sort, weekly progress),
  **keyboard paging** (←/→ in the lesson reader), a **practice-question breakdown** on the
  submodule landing, and refined microcopy throughout. Highlights persist to
  `lesson_highlights` (`services/highlights.ts`) via
  `20260607120000_lesson_highlights_mobile_parity.sql`.
- **Social graph (PR #29).** The follow loop is wired end-to-end: **follow/unfollow**
  (insert/delete `user_followers`, optimistic), real **other-user profiles**
  (`getUserById` → real `users` + counts), **followers/following list** route +
  components, **comment author → profile** links, comment **deep-link anchors**
  (`#comment-<id>` scroll + `:target` highlight), a profile **Comments** tab
  (`getUserComments` + a Reddit-style `CommentCard`), a **"Follows you"** badge, and
  **"Member since"** (`users.created_at`). *Known gap:* an other user's persona / city /
  stage stay hidden because `user_onboarding_profiles` is own-row RLS — needs the DB
  sandbox to add a public-profile read path (see `BACKLOG.md`).
- **Email/password auth + account management + checklist drag (PR #33).** Beyond the auth
  flow (see Auth above), PR #33 shipped **Change email / Change password** modals in Settings
  (`components/account/`, `hooks/useAccount.ts`), rebuilt **checklist drag-to-reorder** on
  `@dnd-kit` (translate-only transform; the old framer-motion `Reorder` combo stuck on
  release), and renamed the home-feed header **"Home" → "Social"** to match the sidebar/mobile.
  No DB migrations (email provider toggled on the dashboard).
- **Storage + security hardening (PR #32 + PR #35).** Images upload through a signed-URL
  CORS-proxy route (`app/api/storage/route.ts`, PR #32). **PR #35** hardened it: **magic-byte
  MIME sniffing** via `file-type` (rejects content that isn't an allowed image or contradicts
  the spoofable client `Content-Type`; signs/PUTs with the *detected* MIME off a single
  `arrayBuffer()` read; route pinned to the Node.js runtime), `MAX_IMAGE_BYTES` lowered
  **5MB → 4MB** (under Vercel's ~4.5MB body cap) with reconciled size strings, and **411** on
  missing/zero/non-numeric `Content-Length` (closes the `Number(null)===0` body-size bypass).
  PR #35 also **backfilled `knowledge_documents.source_url`** for 14 of 16 NULL KB rows so
  `rag-query` answers carry a citation link. **PR #34** ported the PR #25 RPC/`search_path`
  hardening to the legacy **mobile** Supabase project (recorded under
  `supabase/mobile-migrations/`; mobile function signatures — do not run against web).

---

## Pending Tasks

- **Refactor direct Supabase calls out of components into the `hooks/` / `services/`
  layer.** The login page (`app/(auth)/login/page.tsx`) and sidebar
  (`components/layout/Sidebar.tsx`) call `createClient()` directly. Flagged by
  CodeRabbit on PR #1 — do as a separate PR after PR #1 merges.
- **Internationalization / multi-language is not started on web** (mobile shipped it
  in `multi-lang-support`). No `next-intl`/`i18next`, no `messages/` or `locales/`,
  no language switcher. Fully feasible without the DB sandbox — tracked in
  `BACKLOG.md` under "Feasible mobile-parity gaps".

*(Done: "Wire `rag-query` to the Companion UI" — shipped in PR #20; see Build Status.
Both embeddings and answering now run through OpenRouter, so the OpenAI-key blocker
is resolved.)*

---

## Core Design Rule — Read This First

**Layout and structure: follow the Figma mockups.**
**Visual identity: use the Unify mobile app colour scheme.**

The Figma defines how the web app is laid out — the sidebar, the 3-column home page, the section structures, spacing, and component shapes. Use it as the structural reference.

The Figma does NOT define the colours, typography, or visual style. Those come entirely from the mobile app's design system documented in this file. The mobile app uses an orange-first brand palette (`#f68b26` primary) with warm neutrals — that is the Unify brand and it must be applied consistently across the web app.

In practice: if the Figma shows a button, replicate its size and position — but colour it `#f68b26`. If the Figma shows a card, replicate its shape and spacing — but use `#F9F9F9` background and `#CDCBCB` border. If the Figma shows a nav item, match its layout — but apply the mobile app's active state (`bg-primary-bg text-primary`).

Never use colours from the Figma directly. Never invent new colours. The only valid colour source is the token set in the Design System section below.

---

## Skills

The following skills are installed globally. Use them as instructed — do not load all of them simultaneously. Follow the guidance in the **Skill Usage Rules** section below.

```
frontend-design       — Anthropic's official anti-slop design skill. Auto-triggers on UI work.
ui-ux-pro-max         — Design system generator. Run ONCE at the start to produce design-system/MASTER.md.
impeccable            — 23 polish/audit commands. Use /impeccable polish and /impeccable audit before marking any section done.
taste-skill           — Tunable design dials. Set DESIGN_VARIANCE=6, MOTION_INTENSITY=3, VISUAL_DENSITY=7 for this project.
emil-design-eng       — Emil Kowalski's animation + polish philosophy. Use on interaction-heavy components only.
figma-implement-design — Figma MCP skill. Use when given a Figma URL to implement a screen with 1:1 fidelity.
gstack /design-review  — Final QA pass. Run before calling any section complete.
```

### Skill Usage Rules

**Order matters. Do not run visual skills simultaneously — they will give conflicting direction.**

| Phase                  | Skills to use                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project start (once)   | Run `ui-ux-pro-max` with `--design-system --persist` to generate `design-system/MASTER.md`. All subsequent sessions read this file first.                                   |
| Building UI            | `frontend-design` (auto) + `taste-skill` active. Read `design-system/MASTER.md` before writing any component.                                                               |
| Given a Figma URL      | Use `figma-implement-design`. Read `design-system/MASTER.md` first, then fetch the Figma context, then implement.                                                           |
| Finishing a section    | Run `/impeccable polish` then `/impeccable audit`. Fix everything flagged before moving on.                                                                                 |
| Animation/interactions | Use `emil-design-eng` for: chat message send/receive, checklist checkbox, like button, tab switches. Do NOT animate keyboard-initiated actions. Keep UI transitions ≤300ms. |
| Final QA               | Run gstack `/design-review`. Fix any score below 7/10.                                                                                                                      |

### Design System Persistence

On first run, generate and persist the Unify design system:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "newcomer support social platform canada community" --design-system --persist -p "Unify"
```

This creates `design-system/MASTER.md`. **Every session must read this file before building any component.** Never invent one-off hex values or spacing — always reference the master.

### taste-skill Settings for Unify

This is a dense information app (social feed + chat + checklist), not a marketing site. Use:

- `DESIGN_VARIANCE=6` — some layout asymmetry, not rigid grid, not chaotic
- `MOTION_INTENSITY=3` — subtle interactions only, nothing decorative
- `VISUAL_DENSITY=7` — compact and information-dense, generous but not wasteful

### Emil Skill — When to use it

Only invoke `emil-design-eng` for these specific components:

- Chat message bubbles (Companion section) — send/receive animations
- Checklist task completion — checkbox animation + strikethrough transition
- Like button — press feedback
- Tab switching — underline slide transition
- Toast/notification appear/dismiss

Never animate: sidebar nav clicks, page transitions, form submissions, any action repeated >10x/day.

---

## Tech Stack

| Layer           | Technology                                                  |
| --------------- | ----------------------------------------------------------- |
| Framework       | Next.js 16 (App Router)                                     |
| Language        | TypeScript                                                  |
| Styling         | Tailwind CSS v4 (brand tokens in `app/globals.css` `@theme`) |
| Data fetching   | TanStack React Query v5                                     |
| Backend (later) | Supabase — shared web+mobile DB `wrbauxutkysljmsqojts` (since the PR #31 cutover; the web-only `pbiszrycmcxmzxrnkkwr` is retired) |
| CMS (later)     | Sanity (reuse mobile app project — same project ID/dataset) |
| Auth (later)    | Google SSO first, Apple SSO second                          |
| Icons           | lucide-react                                                |
| Utilities       | clsx, tailwind-merge                                        |

---

## Design System

> Always read `design-system/MASTER.md` before building any component. The values below are the source of truth if MASTER.md hasn't been generated yet.

### Brand Colors

```ts
// Primary orange — the main brand color
primary:          '#f68b26'
primary-light:    '#ff9d40'   // lighter orange, used for chat bubbles, decorations
primary-dark:     '#ff820b'   // hover/pressed state
primary-disabled: 'rgba(246,139,38,0.6)'
primary-subtle:   '#ffdfc1'   // avatar fallback bg, light tints
primary-bg:       '#fff8f1'   // active nav item background, pill backgrounds

// Neutrals
ink:              '#000000'
ink-secondary:    '#171616'
ink-tertiary:     '#575757'
ink-muted:        '#686464'   // body text, input text
ink-placeholder:  '#9F9D9D'   // timestamps, secondary info
ink-inactive:     '#B5B1B1'   // inactive tab labels

// Surfaces
surface:          '#FFFFFF'
surface-input:    '#E6E6E6'   // input field backgrounds
surface-gray:     '#F0F0F0'   // hover states, secondary surfaces
surface-card:     '#F9F9F9'   // card backgrounds
surface-chatbot:  '#F3F2F2'   // AI chat background

// Borders
border:           '#C1C1C1'
border-card:      '#CDCBCB'

// Semantic
destructive:      '#FF3B30'
mention-blue:     '#007AFF'

// Checklist priority system
priority-do-now:        '#E03B3B'   bg: '#FBCFCF'
priority-do-soon:       '#F47734'   bg: '#FBE4CF'
priority-explore:       '#F49E34'   bg: '#FFEDBD'
priority-optional:      '#5E8651'   bg: '#CDE9D2'
```

### Logo

The Unify logo is the real brand mark: **six stylized figures arranged in a ring**.
Its three colours are locked to the logo — never use them as UI colours:

- Red-orange `#D8492C`
- Blue `#5182C7`
- Peach `#FFB570`

`components/UnifyLogo.tsx` renders the real raster assets (sourced from the Unify
landing-page repo, stored in `public/logo/`) via `next/image`:

- `unify-mark.png` — symbol only (256×256)
- `unify-lockup.png` — symbol + "unify" wordmark in the brand's custom typeface

Variants: `mark` (default) and `lockup`. The wordmark uses a custom typeface, so the
lockup is the real image asset — do not re-typeset "unify" in Inter or any other font.

### Typography

Use the Inter font (loaded via `next/font/google`). Font sizes should feel slightly compact — this is a dense information app, not a marketing site. No Roboto, Arial, or Space Grotesk.

### Spacing & Radius

Cards: `rounded-lg` (10–12px), `border border-border-card`, subtle shadow.
Sidebar: fixed-width 100px icon+label rail (icon above its label), no collapse.
Page max-width: content areas max out around 680px for feed columns.

---

## App Structure

```
app/
├── (auth)/
│   ├── login/
│   │   └── page.tsx          ← Login page (Google SSO button, stub Apple)
│   └── auth/
│       └── callback/
│           └── route.ts      ← Supabase OAuth callback handler
├── (main)/
│   ├── layout.tsx            ← Shell: sidebar + main content area
│   ├── home/
│   │   └── page.tsx
│   ├── community/
│   │   ├── page.tsx
│   │   └── [groupId]/
│   │       └── page.tsx
│   ├── companion/
│   │   └── page.tsx
│   ├── checklist/
│   │   └── page.tsx
│   ├── learn/
│   │   ├── page.tsx
│   │   └── [moduleId]/
│   │       └── page.tsx
│   └── profile/
│       ├── page.tsx
│       └── [userId]/
│           └── page.tsx
└── page.tsx                  ← Redirect to /home

components/
├── UnifyLogo.tsx
├── layout/
│   └── Sidebar.tsx
├── ui/                       ← Shared primitives
│   ├── Avatar.tsx
│   ├── Badge.tsx
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── PriorityBadge.tsx     ← Checklist priority color system
│   └── Tabs.tsx
├── home/
├── community/
├── companion/
├── checklist/
├── learn/
└── profile/

hooks/                        ← React Query hooks over Supabase + mock fallback
services/                     ← Supabase query functions with mock fallback
lib/
├── supabase/
│   ├── client.ts             ← createBrowserClient
│   └── server.ts             ← createServerClient
├── sanity.ts                 ← Sanity client
└── utils.ts                  ← cn() helper (clsx + tailwind-merge)
types/                        ← TypeScript types
proxy.ts                      ← Supabase session refresh + auth redirect (Next 16)
design-system/
└── MASTER.md                 ← Generated by ui-ux-pro-max. Source of truth for all design decisions.
```

---

## Navigation & Layout

### Navigation (responsive — left sidebar on desktop, bottom tab bar on mobile)

- **Desktop (≥ `md`):** a fixed-width **100px** left sidebar — no collapse, no toggle. Each item is an icon with its label beneath it (`text-xs`), vertically centred (`components/layout/Sidebar.tsx`).
- **Mobile (< `md`):** the sidebar is hidden and a **fixed bottom tab bar** takes over (`components/layout/BottomNav.tsx`), mirroring the mobile app — it carries `pb-[env(safe-area-inset-bottom)]` for the iOS home indicator, and `(main)/layout.tsx` pads `<main>` so page content clears it. **This supersedes the original "no bottom tab bar on any screen size" rule** — a 100px left rail on a 375px phone crushed content (~275px) and broke Companion. Nav items are shared between the two via `components/layout/navItems.ts`; `viewport-fit=cover` is set in `app/layout.tsx` so `env(safe-area-inset-*)` resolves.
- No top nav on any breakpoint.
- Unify wordmark lockup at the top of the desktop sidebar; the nav group is vertically centred; Profile + Settings + Sign out sit at the bottom behind a border.
- Active item: `bg-primary-bg text-primary font-semibold` (sidebar) / `text-primary` (bottom nav); inactive: `text-ink-muted`, hover `text-ink`.

**Top nav items:**

1. Home — `Home` icon
2. Community — `Users` icon
3. Companion — `MessageCircle` icon
4. Checklist — `CheckSquare` icon
5. Learn — `BookOpen` icon

**Bottom nav items (separated by border):** 6. Profile — `User` icon 7. Sign out — `LogOut` icon

### Main layout

Home page: **3-column layout** — sidebar (fixed) | feed (flex, max ~680px) | right widget panel (~320px)

All other pages: **2-column** — sidebar (fixed) | full content area

---

## Section Specs

### Home (`/home`)

**Layout:** 3-column

**Center — Feed:**

- Tab bar: "For You" | "Following" | "Groups"
- Post cards: Avatar + username + timestamp | optional group badge (orange pill) | post title (bold) | body text | action row (❤️ like count | 💬 comment count | 🔖 save) | pinned indicator
- Compose button — pencil/edit icon, top-right of feed header

**Right panel widgets:**

- Learning Progress card: module name + progress bar + percentage
- National News card: list of items with category badge + timestamp

**Mock data:** Realistic Canadian newcomer content. 3–5 posts, 3 news items, 3 progress items. No lorem ipsum.

---

### Community (`/community`)

**Tabs:** Groups | Events | News | Circles

**Groups:** Search bar + "My Groups" horizontal scroll strip + grid of group cards (name, member count, Join button)

**Events:** Event cards with title, date/time, location, event type badge (in-person/online/hybrid), external link

**News:** Article list with title, description snippet, author, date, category badge

**Circles tab:** Orange gradient entry card matching mobile `EntryCard.tsx`:

- Background: `#f68b26`, decorative ellipses `#ff9d40` + `#f59d4a`
- States: default (Join your Circle) | waiting (Finding matches) | in circle (Open my Circle)
- CTA button with arrow icon

---

### Companion (`/companion`)

**Layout:** Sidebar + 2-panel chat layout

- Left panel (~240px): conversation list + "New Conversation" button
- Right panel: active chat
  - User bubbles: right-aligned, `#ff9d40` bg, white text
  - AI bubbles: left-aligned, `#F3F4F6` bg, dark text
  - Grouped bubble radius: connecting messages reduce border-radius on adjacent sides
  - Input bar fixed at bottom with send button
  - Starter prompt chips when no conversation active (4 suggestions)
  - Free tier indicator: "6 messages/day remaining"

**Emil skill applies here:** subtle scale + opacity animation on message send (≤200ms, ease-out). Nothing else animated.

---

### Checklist (`/checklist`)

**Layout:** Sidebar + content (max ~720px)

**Priority sections in order:**

1. Do Now — `#E03B3B` / `#FBCFCF`
2. Do Soon — `#F47734` / `#FBE4CF`
3. Explore & Connect — `#F49E34` / `#FFEDBD`
4. Optional / Later — `#5E8651` / `#CDE9D2`

Each section: collapsible header (priority color + icon + count badge) → task rows (checkbox | name | description | optional "Learn how" link). Completed tasks: strikethrough + muted. "Add custom task" at bottom.

Overall progress bar at top.

**Emil skill applies here:** checkbox completion animation (scale bounce, ≤150ms) + strikethrough transition (≤200ms).

---

### Learn (`/learn`)

**Layout:** Sidebar + content

**Module list:** Hero card for in-progress module → grid of module cards (title, description, color dot, progress badge: Not started / In progress / Completed)

**Module detail (`/learn/[moduleId]`):** Breadcrumb → submodule list with lesson count + progress bar per submodule → expandable to show lessons

---

### Profile (`/profile`)

**Layout:** Sidebar + content (max ~680px)

**Own profile:** Large avatar (80px) + username + edit button | stats row (Following | Followers) | persona badge | city + province | stage indicator | Tabs: Posts | Saved | Highlights

**Other user (`/profile/[userId]`):** Same layout, Follow button instead of edit, no Saved/Highlights tabs

---

### Login (`/login`)

Full-screen centered, no sidebar. White background with subtle warm tint.

- Unify logo + wordmark
- Tagline: "Supporting your journey in Canada"
- "Continue with Google" (white button, border, Google icon)
- "Continue with Apple" (black button — stub, not wired)
- Fine print: "By continuing, you agree to our Terms and Privacy Policy"

---

## UI Component Specs

### Avatar

Props: `profilePictureUrl?`, `username`, `size` (default 36), `className?`
No image → initials (first letter of each word, max 2) on `primary-subtle` bg
With image → `rounded-full` img

### PriorityBadge

Props: `priority: 'Do now' | 'Do soon' | 'Explore and connect' | 'Optional / later'`
Colored dot + label with matching background pill. Use exact hex values from the priority color system.

### Button

Variants: `'primary' | 'secondary' | 'ghost' | 'destructive'`
Sizes: `'sm' | 'md' | 'lg'`
Supports: loading spinner, disabled, leftIcon, rightIcon

### Tabs

Props: `tabs: string[]`, `activeTab`, `onChange`
Style: underline tabs — `border-b-2 border-primary` on active, orange text

---

## Key Patterns

1. **Service layer separation** — Supabase queries in `services/`, React Query hooks in `hooks/`, components call hooks only. Follow the Community pattern (`services/community.ts` + `hooks/useCommunity.ts`): `isSupabaseConfigured()` + `getAuthUserId()` guards, snake_case row mappers, mock fallback when env vars aren't set (local dev), React Query hooks with stable query keys and `onSuccess` invalidation.

2. **Mock data** — realistic Canadian newcomer context everywhere. Lives in `lib/mock/` and serves as the local-dev / env-not-configured fallback for all wired sections (including Checklist and Learn).

3. **Feed pagination** — keyset cursor pagination. Cursors = `created_at` timestamps (not offset).

4. **Priority order** — always: Do now → Do soon → Explore & connect → Optional / later.

5. **Persona types:**

```ts
type Persona = "international_student" | "skilled_worker" | "refugee" | "other";
```

6. **Stage system:**

- Stage 0: not arrived yet
- Stage 1: 0–3 months
- Stage 2: 3–12 months
- Stage 3: 1–3 years
- Stage 4: 3+ years

---

## Supabase Schema Reference (for type definitions only — do not create tables yet)

```
users                    — id, username, profile_picture_url, is_premium, permissions
user_onboarding_profiles — id, persona, arrival_date, city, province, stage, goals[], learning_interests[]
posts                    — id, title, content, like_count, comment_count, user_id, group_id, is_pinned, post_image_urls[]
post_comments            — id, user_id, post_id, content, parent_comment_id, like_count
post_likes               — user_id, post_id
post_saves               — user_id, post_id
groups                   — id, group_name, group_description, member_count, cover_photo_url
group_members            — user_id, group_id, joined_at
user_followers           — follower_id, following_id
conversations            — id, conversation_identifier, user_id, title, updated_at
messages                 — id, conversation_id, role, content, sources (JSONB)
chatbot_usage            — user_id, message_count, last_message_at
user_tasks               — user_task_id, user_id, sanity_checklist_id, completed, completed_at
custom_checklist_tasks   — id, user_id, priority, title, description, completed
events                   — id, title, event_datetime, location, event_type, cover_photo_url
news_details             — id, title, description, author, date, image_link
community_circles        — id, persona, time_in_canada, goal, topics[], status, ends_at
community_notifications  — id, user_id, type, title, body, read_at
learn_progress           — user_id, module_id, status, completed_at
user_lesson_progress     — user_id, sanity_lesson_id, progress_percent, is_completed
lesson_highlights        — user_id, lesson_id, page_key, selected_text
```

**RPCs:** `get_post_metadata_batch`, `merge_highlights`, `pin_post`, `unpin_post`

**Edge functions:** `rag-query`, `generate-title`, `gemini-proxy`, `report-post`, `report-user`, `block-user`, `send-social-push`, `get-daily-tip`, `explain-term`, `profile-picture-upload`, `profile-picture-get`

---

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SANITY_PROJECT_ID=    # reuse from mobile app
NEXT_PUBLIC_SANITY_DATASET=production
```

---

## Team & Workflow Notes

**CodeRabbit** is set up for automated code reviews on all PRs. Never merge directly to main — always open a PR so CodeRabbit can review it first. It will comment on the PR with issues it finds. Claude Code can then review that feedback and decide if it is valid (CodeRabbit sometimes flags things without full app context, since it only sees files touched in the PR).

**Learn section** — Wired in Phase 7. Content comes from Sanity (modules, submodules, lessons, full lesson body rendered via `@portabletext/react`); per-user state comes from Supabase (`learn_progress`, `user_lesson_progress`, `learn_favourites`). The lesson detail page renders real Sanity `pages` + `ending_pages` portable text — no placeholder objectives/key terms (those fields don't exist in the Sanity schema).

---

## What NOT to build yet

- No edge function calls
- No image upload
- No push notifications
- No PostHog / analytics
- No Meta SDK / Facebook tracking
- No premium/paywall gating logic

---

## Build Order

1. Read `design-system/MASTER.md` if it exists. If not, run `ui-ux-pro-max` first to generate it.
2. Project init: `create-next-app` with TypeScript + Tailwind + App Router
3. Install deps: `@supabase/ssr @supabase/supabase-js @tanstack/react-query @sanity/client lucide-react clsx tailwind-merge`
4. `app/globals.css` — full brand token set via Tailwind v4 `@theme`
5. `app/globals.css` — CSS variables + component classes
6. `lib/utils.ts` — `cn()` helper
7. `lib/supabase/client.ts` + `lib/supabase/server.ts` + `lib/sanity.ts`
8. `proxy.ts` — session refresh (Next 16 successor to `middleware.ts`)
9. `components/UnifyLogo.tsx` — real logo assets via `next/image` (`mark` / `lockup` variants)
10. `components/ui/` — Avatar, Button, Badge, PriorityBadge, Tabs
11. `components/layout/Sidebar.tsx` — collapsible, all 5 nav items
12. `app/(main)/layout.tsx` — shell
13. `app/(auth)/login/page.tsx` — login UI
14. `app/(main)/home/page.tsx` — 3-column layout + mock feed
15. `app/(main)/community/page.tsx` — 4 tabs
16. `app/(main)/companion/page.tsx` — chat UI (apply emil-design-eng here)
17. `app/(main)/checklist/page.tsx` — priority sections (apply emil-design-eng here)
18. `app/(main)/learn/page.tsx` + `[moduleId]/page.tsx`
19. `app/(main)/profile/page.tsx` + `[userId]/page.tsx`
20. Stub `services/` + `hooks/` file structure
21. `app/page.tsx` → redirect to `/home`
22. Run `/impeccable audit` on every section. Run gstack `/design-review`. Fix everything flagged.

---

## Common Bugs to Avoid

**Always wire mutations to the component**
When adding a service function and hook mutation, verify the component that renders the relevant button actually imports and calls the hook. It is easy to wire the service and hook correctly but leave the component calling local state only. Before committing any mutation work, grep for the hook name in the component file to confirm it is imported and called.
