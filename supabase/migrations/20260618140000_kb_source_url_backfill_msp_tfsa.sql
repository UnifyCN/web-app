-- Backfill knowledge_documents.source_url for the remaining file-seeded KB docs
-- that have a verified authoritative external source, so rag-query / rag-query-web
-- can emit a citation link (a chunk is cited only when its doc has a resolvable URL).
--
-- APPLY MANUALLY VIA THE SUPABASE DASHBOARD (SQL editor) against the shared project
-- `wrbauxutkysljmsqojts`. The MCP servers are read-only and `db push` is unsafe
-- against this remote history. Shared DB (mobile + web) — review first. The
-- `source_url is null` guard makes each statement idempotent / replay-safe.
--
-- Supersedes the commented candidates in 20260618130000_kb_source_url_backfill_sin.sql.
-- Verified URLs:
--   8  Medical Services Plan.md  → official BC MSP page (confirmed live, 200).
--   11 What is a TFSA - Canada.ca.md → the same canonical CRA TFSA URL already set
--      on doc 4 "tsfa.pdf" (canada.ca returns 403 to bots, not a 404).
-- ids 17 (Goals Module) and 18 (Networking Module) are internal Unify content with
-- no external authoritative source — intentionally left NULL.
--
-- Note: the NULL source_url on these file-seeded docs is legacy from the original
-- one-time CSV KB seed; the `ingest-documents` crawler already sets source_url for
-- every doc it ingests, so future crawler additions don't need backfilling.

update public.knowledge_documents
   set source_url = 'https://www2.gov.bc.ca/gov/content/health/health-drug-coverage/msp'
 where id = 8 and source_url is null;

update public.knowledge_documents
   set source_url = 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account.html'
 where id = 11 and source_url is null;
