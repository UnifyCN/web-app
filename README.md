# Unify — Web App

The web frontend for **Unify**, a newcomer support platform for people settling in
Canada. It mirrors the features of the existing React Native mobile app
(`github.com/UnifyCN/mobile-app`).

## Status

**Frontend complete — runs entirely on mock data.** Every section is built; no
backend, auth, or real content is wired yet. All stubbed data sources are flagged
`// TODO: replace with real data`.

## Tech stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS v4** — brand tokens live in `app/globals.css` under `@theme`
- **TanStack React Query v5** — data layer (`services/` + `hooks/`, stubbed)
- **Geist** font · **lucide-react** icons
- Backend (later): Supabase · Sanity CMS · Google/Apple SSO

## Getting started

Requires **Node 22** (an `.nvmrc` is included).

```bash
nvm use 22
npm install
npm run dev
```

Then open <http://localhost:3000>.

```bash
npm run build   # production build
npm run lint    # eslint
```

## Project structure

```
app/                 Next.js App Router — (auth) and (main) route groups
components/          UI primitives (ui/) + per-section components
lib/mock/            realistic Canadian-newcomer mock data
lib/                 utils, Supabase/Sanity client stubs
services/            data-access stubs (swap to Supabase queries later)
hooks/               React Query hooks wrapping the services
types/               shared TypeScript types
design-system/       MASTER.md — the design source of truth
design-refs/         Figma reference screenshots
```

## Key docs

- **`CLAUDE.md`** — project spec, design rules, and conventions
- **`design-system/MASTER.md`** — design system / brand tokens (read before building UI)
- **`PLAN.md`** — phase-by-phase build record

## Environment

Copy the example and fill in values when wiring the backend:

```bash
cp .env.local.example .env.local
```

## Not built yet

Backend wiring (Supabase), authentication, real Sanity content, image upload, and
analytics — see "What NOT to build yet" in `CLAUDE.md`.
