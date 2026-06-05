-- Companion: persist the LLM-generated follow-up suggestions per assistant message.
--
-- The rag-query edge function already returns `suggestedNextSteps` (parsed from the
-- model's [SUGGESTIONS]: line in the same completion). The web persists them so the
-- "Ask a follow-up" chips survive a reload. JSONB to match the existing `sources`
-- column. Nullable; the existing own-row RLS policies + table-level grants on
-- public.messages already cover new columns, so no policy/grant change is needed.

alter table public.messages
  add column if not exists suggested_next_steps jsonb;
