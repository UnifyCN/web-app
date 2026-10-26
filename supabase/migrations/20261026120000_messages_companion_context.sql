-- Companion context beside a saved assistant answer (spec UnifyCN/mobile-app#359,
-- ticket #362). rag-query returns a structured `context` object with each answer:
-- the app records it read (ids and revisions), the official pages it checked
-- (URL, publisher, check time) and what it asked about. Clients save it with the
-- assistant message so a reopened conversation shows the same sources and
-- context as the live answer, on mobile and web.
--
-- Additive and nullable: older clients never select or write it, and the
-- existing messages policies (rows scoped through the owning conversation) cover
-- the new column. It holds message history only. It is never read as profile
-- data or as a saved personal detail.
--
-- Rollback: `alter table public.messages drop column companion_context;`
-- New clients fall back to saving and reading messages without it.

alter table public.messages
  add column if not exists companion_context jsonb;

alter table public.messages
  drop constraint if exists messages_companion_context_shape;
alter table public.messages
  add constraint messages_companion_context_shape check (
    companion_context is null
    or (
      jsonb_typeof(companion_context) = 'object'
      and (companion_context ->> 'version') = '1'
      and pg_column_size(companion_context) <= 32768
    )
  );
