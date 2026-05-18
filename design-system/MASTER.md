# Unify Web App — Design System (MASTER)

> **SOURCE OF TRUTH.** Read this file before building any component.
>
> This file was authored from the **Unify mobile-app brand tokens in `CLAUDE.md`**.
> The raw `ui-ux-pro-max` generator output lives at `design-system/unify/MASTER.md`
> for provenance only — its rose/Inter recommendations are **generic and were
> rejected**: CLAUDE.md's core design rule (orange-first brand, Geist font, never
> invent colours) overrides the generator. Use only the tokens below.

---

## Core Design Rule

- **Layout & structure** → from the Figma file (`7kxyT3Ud3zqy6Fl68cK05v`, node `3701-3084`).
- **Colour, typography, visual style** → only from the tokens in this file.
- Never sample a colour from Figma. Never invent a hex value. If a colour is needed
  and not listed here, it does not exist.

---

## Brand Colours

### Primary (orange)

| Token | Hex | Usage |
|---|---|---|
| `primary` | `#f68b26` | Main brand colour — buttons, active states, accents |
| `primary-light` | `#ff9d40` | Chat bubbles (user), decorative ellipses |
| `primary-dark` | `#ff820b` | Hover / pressed state |
| `primary-disabled` | `rgba(246,139,38,0.6)` | Disabled primary buttons |
| `primary-subtle` | `#ffdfc1` | Avatar fallback bg, light tints |
| `primary-bg` | `#fff8f1` | Active nav item bg, pill backgrounds |

### Neutrals (ink)

| Token | Hex | Usage |
|---|---|---|
| `ink` | `#000000` | Highest-emphasis text |
| `ink-secondary` | `#171616` | Headings |
| `ink-tertiary` | `#575757` | Sub-headings |
| `ink-muted` | `#686464` | Body text, input text |
| `ink-placeholder` | `#9F9D9D` | Timestamps, secondary info |
| `ink-inactive` | `#B5B1B1` | Inactive tab labels |

### Surfaces

| Token | Hex | Usage |
|---|---|---|
| `surface` | `#FFFFFF` | Default surface |
| `surface-input` | `#E6E6E6` | Input field backgrounds |
| `surface-gray` | `#F0F0F0` | Page background, hover states |
| `surface-card` | `#F9F9F9` | Card backgrounds |
| `surface-chatbot` | `#F3F2F2` | AI chat background |

### Borders

| Token | Hex |
|---|---|
| `border` | `#C1C1C1` |
| `border-card` | `#CDCBCB` |

### Semantic

| Token | Hex |
|---|---|
| `destructive` | `#FF3B30` |
| `mention-blue` | `#007AFF` |

### Checklist Priority System

| Priority | Accent | Background |
|---|---|---|
| Do now | `#E03B3B` | `#FBCFCF` |
| Do soon | `#F47734` | `#FBE4CF` |
| Explore & connect | `#F49E34` | `#FFEDBD` |
| Optional / later | `#5E8651` | `#CDE9D2` |

Priority order is fixed everywhere: **Do now → Do soon → Explore & connect → Optional/later**.

### Logo Circles (Unify mark only — not UI colours)

Top-left orange `#f68b26` · top-right blue `#4A90D9` · bottom-left green `#5CB85C` ·
bottom-right red `#E05C5C`. Use **only** inside `UnifyLogo.tsx`.

---

## Typography

- **Font:** Geist (Next.js built-in via `next/font`). Geist Sans for everything.
  Geist Mono only for code-like content if ever needed.
- **Forbidden:** Inter, Roboto, Arial, Space Grotesk.
- Dense information app — sizes feel slightly **compact**, not marketing-large.

| Role | Size | Weight |
|---|---|---|
| Page title | `text-xl` (20px) | 600 |
| Section heading | `text-base` (16px) | 600 |
| Card title / post title | `text-sm`–`text-base` | 600 |
| Body | `text-sm` (14px) | 400 |
| Meta / timestamp | `text-xs` (12px) | 400 |

Colour body text `ink-muted`, headings `ink-secondary`, meta `ink-placeholder`.

---

## Spacing & Radius

| Token | Value | Usage |
|---|---|---|
| `xs` | 4px | Tight gaps |
| `sm` | 8px | Icon gaps, inline spacing |
| `md` | 16px | Standard padding |
| `lg` | 24px | Section padding |
| `xl` | 32px | Large gaps |

- **Cards:** `rounded-lg` (10–12px), `border border-border-card`, subtle shadow.
- **Sidebar:** 220px expanded / 64px collapsed. `transition-all duration-200 ease-in-out`.
- **Feed column** max-width ~680px. **Right widget panel** ~320px. Content pages max ~680–720px.

### Shadows

| Token | Value | Usage |
|---|---|---|
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Card resting state |
| `shadow-md` | `0 4px 6px rgba(0,0,0,0.08)` | Hover, dropdowns |
| `shadow-lg` | `0 10px 15px rgba(0,0,0,0.10)` | Modals, popovers |

Keep shadows subtle — this is a warm, calm product, not a high-contrast one.

---

## Component Specs

### Button — variants `primary | secondary | ghost | destructive`, sizes `sm | md | lg`

- `primary`: bg `primary`, white text; hover `primary-dark`; disabled `primary-disabled`.
- `secondary`: white bg, `border-card` border, `ink-secondary` text; hover `surface-gray`.
- `ghost`: transparent, `ink-muted` text; hover `surface-gray`.
- `destructive`: bg `destructive`, white text.
- `rounded-lg`, font-weight 600, `transition-colors duration-150`.
- Supports loading spinner, disabled, `leftIcon`, `rightIcon`.

### Card

`bg-surface-card` · `border border-border-card` · `rounded-lg` · `shadow-sm` ·
padding `16px` (`p-4`). Hover (interactive cards only): `shadow-md`, no layout shift.

### Avatar

`profilePictureUrl?`, `username`, `size` (default 36), `className?`.
No image → up to 2 initials on `primary-subtle` bg, `primary-dark` text. With image →
`rounded-full` `object-cover`.

### Badge / Pill

Group badge: orange pill — `bg-primary-bg text-primary` `text-xs` `rounded-full` `px-2 py-0.5`.

### PriorityBadge

`priority: 'Do now' | 'Do soon' | 'Explore and connect' | 'Optional / later'`.
Colored dot + label on matching background pill — exact hex from the priority table.

### Tabs

`tabs: string[]`, `activeTab`, `onChange`. Underline style — active tab
`border-b-2 border-primary text-primary font-semibold`, inactive `text-ink-inactive`.

### Input

`bg-surface-input` (or white with `border`), `rounded-lg`, `text-sm`,
text colour `ink-muted`, placeholder `ink-placeholder`, focus ring `primary`.

### Sidebar nav item

Active: `bg-primary-bg text-primary font-semibold`. Inactive: `text-ink-muted`,
hover `bg-surface-gray text-ink`.

---

## Motion (taste-skill dials: VARIANCE=6, MOTION=3, DENSITY=7)

- All UI transitions **≤300ms**, ease-out. Default `duration-150` for hover/colour.
- Respect `prefers-reduced-motion` — disable non-essential motion.
- **Animate only** (per CLAUDE.md / emil-design-eng):
  - Chat message send/receive — scale + opacity, ≤200ms ease-out.
  - Checklist checkbox — scale bounce ≤150ms + strikethrough transition ≤200ms.
  - Like button — press feedback.
  - Tab switch — underline slide.
  - Toast appear/dismiss.
- **Never animate:** sidebar nav clicks, page transitions, form submissions, any
  keyboard-initiated action, anything repeated >10×/day.

---

## Anti-Patterns (do NOT use)

- ❌ Colours sampled from Figma or invented hex values — tokens only.
- ❌ Inter / Roboto / Arial / Space Grotesk — Geist only.
- ❌ Emojis as icons — use `lucide-react`.
- ❌ Layout-shifting hover transforms (`translateY`/`scale` that reflow).
- ❌ Missing `cursor-pointer` on clickable elements.
- ❌ Instant state changes — always transition (150–300ms).
- ❌ Invisible focus states — keyboard focus must be visible.
- ❌ Text contrast below 4.5:1.
- ❌ Bottom tab bar or top nav — sidebar is the only navigation, all breakpoints.

---

## Pre-Delivery Checklist (run before every `/impeccable audit`)

- [ ] Every colour traces to a token in this file.
- [ ] Geist font only.
- [ ] All icons from `lucide-react` — no emoji icons.
- [ ] `cursor-pointer` on all clickable elements.
- [ ] Hover + focus states present, transitions 150–300ms.
- [ ] `prefers-reduced-motion` respected.
- [ ] Contrast ≥4.5:1 for body text.
- [ ] Mock data is realistic Canadian newcomer content — no lorem ipsum.
- [ ] Every stubbed data source flagged `// TODO: replace with real data`.
- [ ] Responsive at 1024px / 1280px / 1440px (sidebar layout, never tab bar).
