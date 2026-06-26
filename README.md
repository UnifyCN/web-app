# Unify — Web App

A web app helping newcomers settle in Canada — built by Unify.

Unify provides community, personalized checklists, AI-powered guidance, and
educational content to support immigrants, refugees, international students, and
skilled workers through their settlement journey. This is the web companion to the
Unify React Native mobile app ([`github.com/UnifyCN/mobile-app`](https://github.com/UnifyCN/mobile-app)),
mirroring its features for the browser.

## Tech Stack

| Layer       | Technology                                                        |
| ----------- | ----------------------------------------------------------------- |
| Framework   | Next.js 16 (App Router)                                            |
| Language    | TypeScript                                                        |
| Routing     | Next.js App Router (file-based) — `(auth)` / `(main)` / `(onboarding)` route groups |
| UI          | React 19, Tailwind CSS v4 (`@theme` brand tokens), lucide-react   |
| State       | React Query v5 (server state), React component state (local)      |
| Backend     | Supabase (Auth, PostgreSQL, Edge Functions)                       |
| CMS         | Sanity (Learn content, checklist templates)                       |
| AI          | OpenRouter embeddings + Google Gemini (via OpenRouter), behind the shared `rag-query` edge function |
| Images      | Sanity image CDN (`@sanity/image-url`); user uploads not yet built |
| Fonts       | Inter (`next/font/google`)                                        |
| Utilities   | clsx, tailwind-merge                                              |

## Features

The app is organized around a persistent left sidebar with five primary sections
plus Profile (it stays a sidebar at every breakpoint — no bottom tab bar).

### Home Feed

Three sub-feeds — **For You**, **Following**, and **Groups** — with keyset cursor
pagination (cursors are `created_at` timestamps, not offsets), post cards with likes,
comments, saves, group badges, and a pinned indicator. A right-hand widget panel
shows a Learning Progress card and a National News list.

### Community

Browse and join **Groups** (search + a "My Groups" strip), discover **Events**
(typed in-person / online / hybrid, with a detail route), read **News**, and access
**Circles** — peer matching that groups users with similar backgrounds (persona +
time in Canada) into small support circles. Waitlist join/leave is wired against the
mobile-mirrored schema; the matching engine is deferred, and the Circles tab is
currently hidden to mirror the mobile launch navigation.

### Companion

An AI chatbot powered by **RAG** (Retrieval-Augmented Generation) over Sanity CMS
content, served by the `rag-query` Supabase Edge Function. Supports conversation
history, starter prompts, and source citations. Free tier: **3 messages/day**,
enforced by a Postgres RPC with a quota refund on failure. (End-to-end retrieval is
gated on a working OpenAI embeddings key — see Status.)

### Checklist

Personalized onboarding tasks based on the user's **persona** (international student,
skilled worker, refugee, other) and **time in Canada**
(0–3 months through 3+ years). Tasks are defined in Sanity CMS, bucketed into four
priorities (Do now → Do soon → Explore & connect → Optional / later), with per-user
completion and user-created custom tasks tracked in Supabase.

### Learn

Structured educational **modules → submodules → lessons** (Sanity Portable Text with
custom content blocks: example/tip/note callouts, dropdowns, images, checklist
items), a paginated lesson reader, section **Practice** quizzes and lesson **Quick
Checks**, and per-user progress tracking. Section pages render a Learn → Practice
activity timeline in each module's colour.

### Profile

Own profile (avatar, stats, persona badge, city/province, settlement stage, and
Posts / Saved / Highlights tabs) and other-user profiles with follow/unfollow.

### Additional Features

- **Auth:** Google OAuth (live); Apple Sign-In (stubbed). The OAuth callback
  bootstraps the `public.users` row (`lib/supabase/ensureUserRow.ts`).
- **Onboarding:** persona + arrival date → a computed settlement stage
  (`lib/onboarding/calculateUserStage.ts`).
- **Mock fallback:** every section falls back to realistic Canadian-newcomer mock
  data (`lib/mock/`) when Supabase/Sanity env vars aren't set (local dev).
- **Design system:** orange-first brand palette with warm neutrals; tokens in
  `app/globals.css` (`@theme`) and `design-system/MASTER.md`.

> **Not yet wired (frontend):** image upload, push notifications, analytics,
> moderation/reporting, and premium gating — see "What NOT to build yet" in
> `CLAUDE.md`.

## Status

Frontend is built; Supabase + Sanity wiring is well underway. **Auth, Profile,
Home/Feed, Community, Companion, Checklist, and Learn are wired to real data.** The
Companion RAG pipeline is deployed (`rag-query` edge function, seeded knowledge base,
daily rate-limit RPC) but retrieval is **blocked on a working `OPENAI_API_KEY`** for
embeddings. See `BACKLOG.md` for upcoming phases.

## Architecture

```text
┌──────────────────────────────────────────────────────┐
│                 Next.js 16 (App Router)               │
│          browser components + server routes           │
│                                                       │
│   ┌──────────┐   ┌──────────┐   ┌────────────────┐   │
│   │  Screens │   │  Hooks   │   │   Components    │   │
│   │  (app/)  │   │ (React   │   │  (ui/ + per-    │   │
│   │          │   │  Query)  │   │   section)      │   │
│   └────┬─────┘   └────┬─────┘   └────────────────┘   │
│        │              │                               │
│        └──────┬───────┘            proxy.ts            │
│               │              (session refresh +        │
│        ┌──────▼──────┐        auth redirect)           │
│        │  Services   │                                 │
│        └──────┬──────┘                                 │
└───────────────┼────────────────────────────────────────┘
                │
       ┌────────┼─────────────────┐
       │        │                 │
       ▼        ▼                 ▼
┌────────────┐ ┌────────┐  ┌────────────────────┐
│  Supabase  │ │ Sanity │  │   AI providers     │
│  Auth      │ │  CMS   │  │  OpenAI (embed) +  │
│  Postgres  │ │ (Learn,│  │  OpenRouter →      │
│  + RLS     │ │  tasks)│  │  Gemini (generate) │
│  Edge Funcs│ │        │  │  via rag-query     │
└────────────┘ └────────┘  └────────────────────┘
```

## Key Patterns

- **Service + hook wiring** (`services/community.ts` + `hooks/useCommunity.ts`) —
  the template every section follows: `isSupabaseConfigured()` + `getAuthUserId()`
  guards, snake_case → camelCase row mappers, React Query hooks with stable query
  keys and `onSuccess` invalidation.
- **Mock fallback** — `lib/mock/*` is the data source when env vars aren't configured
  (local dev), so the UI runs end-to-end without a backend.
- **Keyset cursor pagination** — `services/feed.ts` paginates feeds by `created_at`
  cursor (not offset), ready for infinite scroll.
- **Singleton browser client** — `lib/supabase/client.ts` returns one browser client
  to avoid multiple `GoTrueClient` instances.
- **Session refresh + auth gate** — `proxy.ts` (Next 16's middleware successor)
  refreshes the Supabase session and redirects unauthenticated traffic to `/login`.
- **User row bootstrap** — `lib/supabase/ensureUserRow.ts` creates the `public.users`
  row in the OAuth callback and self-heals in `getCurrentUser`.
- **Portable Text rendering** — `components/learn/PortableTextRenderer.tsx` renders
  Sanity lessons, including the custom content-block types.
- **Practice flattening** — `components/learn/practice/flattenPractices.ts` merges
  `quiz` and `activity` practices into a single quiz flow the renderers handle.

## Supabase Edge Functions

| Function    | Purpose                                                                |
| ----------- | --------------------------------------------------------------------- |
| `rag-query` | Embeds the query (OpenRouter), retrieves matching KB content via the `match_chunks` RPC, and returns a grounded answer with citations (Gemini via OpenRouter). Shared unified function for web + mobile; web reaches it via the `/api/companion` proxy (tagged `source:"web"`). |

Other mobile edge functions (`gemini-proxy`, `report-post`, `block-user`, etc.) are
not yet ported to the web app.

Server-side logic also lives in **Postgres RPCs**, including
`check_and_increment_chatbot_usage` / `refund_chatbot_message` (daily chatbot rate
limit + refund), `match_chunks` (RAG vector search), `get_post_metadata_batch`,
`pin_post` / `unpin_post`, `merge_highlights`, and `is_circle_member`.

## Project Structure

```text
web-app/
├── app/                          # Next.js App Router
│   ├── (auth)/
│   │   ├── login/                # Google / Apple SSO
│   │   └── auth/callback/        # OAuth code exchange
│   ├── (main)/                   # Authenticated shell (sidebar + content)
│   │   ├── home/                 # 3-column feed (For You / Following / Groups)
│   │   ├── community/            # Groups, Events, News, Circles
│   │   ├── companion/            # AI chatbot
│   │   ├── checklist/            # Onboarding tasks
│   │   ├── learn/                # Modules → submodules → lessons + practice
│   │   └── profile/              # Own + other-user profiles
│   ├── (onboarding)/onboarding/  # Persona + arrival details
│   ├── providers.tsx             # React Query provider
│   └── layout.tsx                # Root layout
├── components/
│   ├── ui/                       # Avatar, Button, Badge, PriorityBadge, Tabs
│   ├── layout/                   # Sidebar
│   └── home/ community/ companion/ checklist/ learn/ profile/ onboarding/ icons/
├── hooks/                        # React Query hooks (useFeed, useCommunity, useLearn, …)
├── services/                     # Supabase / Sanity queries + mock fallback
├── lib/
│   ├── supabase/                 # client (singleton), server, ensureUserRow, username
│   ├── sanity.ts                 # Sanity client + GROQ queries
│   ├── mock/                     # local-dev / env-not-configured fallback data
│   ├── onboarding/               # settlement-stage calculation + constants
│   └── utils.ts                  # cn() helper (clsx + tailwind-merge)
├── types/                        # shared TypeScript definitions
├── proxy.ts                      # session refresh + auth redirect (Next 16)
├── supabase/
│   ├── migrations/               # schema + RLS + grants + RPCs
│   └── functions/                # Edge functions (Deno): rag-query, _shared
├── design-system/MASTER.md       # design source of truth
└── design-refs/                  # Figma reference screenshots
```

## Getting Started

### Prerequisites

- Node.js 22 (an `.nvmrc` is included — run `nvm use`)
- npm
- (Optional) Supabase CLI — for applying migrations and deploying edge functions

### Installation

```bash
git clone <repository-url>
cd Unify/web-app
nvm use
npm install
```

### Environment

Create a `.env.local` in `web-app/` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=         # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Supabase anon key
NEXT_PUBLIC_SANITY_PROJECT_ID=    # Sanity project ID (fercgabp)
NEXT_PUBLIC_SANITY_DATASET=       # Sanity dataset (production)
```

Without these, the app runs entirely on mock data (`lib/mock/`). Edge-function
secrets (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, embedding model, etc.) are **not**
web env vars — they're configured server-side via `supabase secrets set`. As of now
`OPENROUTER_API_KEY` is set; a valid `OPENAI_API_KEY` for embeddings is still pending.

### Running

```bash
npm run dev      # dev server → http://localhost:3000
```

## Scripts

| Command         | Description              |
| --------------- | ------------------------ |
| `npm run dev`   | Start the Next.js dev server |
| `npm run build` | Production build         |
| `npm start`     | Serve the production build |
| `npm run lint`  | Run ESLint               |

## Security

- **Supabase Row Level Security (RLS)** with own-row policies on every table; a grants
  migration restores the narrow public-schema access the API roles need.
- **Auth gating** — `proxy.ts` refreshes the session and redirects unauthenticated
  traffic away from the `(main)` route group to `/login`.
- **AI keys server-side only** — `OPENROUTER_API_KEY` / `OPENAI_API_KEY` live as edge
  function secrets, never as `NEXT_PUBLIC_*`; the browser client uses the anon key
  only, and the service-role key is confined to edge functions.
- **Daily rate limiting** — `check_and_increment_chatbot_usage` (cap 6/day) is a
  `SECURITY DEFINER` RPC, with `refund_chatbot_message` refunding the quota when a
  request fails.
- **`is_circle_member`** is an intentional `SECURITY DEFINER` helper used to break the
  RLS recursion between `community_circles` and `community_circle_members`; it only
  returns membership for the passed circle id (no data leak).

## Content (Sanity)

Learn modules, lessons, practices, and checklist templates are authored in Sanity
Studio: **<https://unify.sanity.studio>** (project `fercgabp`, dataset `production`),
shared with the mobile app.

## Key Docs

- **`CLAUDE.md`** — project spec, design rules, build status, and conventions
- **`design-system/MASTER.md`** — design system / brand tokens (read before building UI)
- **`PLAN.md`** — phase-by-phase build record
- **`BACKLOG.md`** — deferred items and upcoming phases
