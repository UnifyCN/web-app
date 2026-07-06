-- In-Lesson Help (PRD R3): tag Companion conversations started from inside a
-- lesson so they're distinguishable from full-tab chats in history queries.
--
-- ⚠️ Shared-DB migration (`conversations` is mobile-owned on wrbauxutkysljmsqojts).
-- Apply via the dashboard SQL editor after mobile-team (Savar) ack — the MCP is
-- read-only and `supabase db push` is unsafe against the drifted remote history.
-- Additive + nullable, so it is a no-op for mobile's existing reads/writes.
-- Until applied, the web client's tagged insert falls back to an untagged one
-- (see services/companion.ts createConversation).

alter table public.conversations
  add column if not exists source text
    check (source is null or source in ('in-lesson')),
  add column if not exists lesson_id text;

comment on column public.conversations.source is
  'Where the conversation started: null = Companion tab, ''in-lesson'' = In-Lesson Help chat.';
comment on column public.conversations.lesson_id is
  'Sanity lesson _id the In-Lesson Help chat was opened from (null otherwise).';
