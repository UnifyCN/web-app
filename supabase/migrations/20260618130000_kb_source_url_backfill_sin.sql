-- Backfill knowledge_documents.source_url so rag-query / rag-query-web can emit a
-- citation link for these docs (a chunk is only added to `sources` when the doc
-- has a resolvable URL: source_url, else an S3 URL from storage_path).
--
-- APPLY MANUALLY VIA THE SUPABASE DASHBOARD (SQL editor) against the shared
-- project `wrbauxutkysljmsqojts`. The MCP servers are read-only and `db push`
-- is unsafe against this remote history. Shared DB (mobile + web) — review first.
-- The `source_url is null` guard makes each statement idempotent / replay-safe.
--
-- As of 2026-06-18, 6 knowledge_documents have a NULL source_url:
--   5  Sin Canada Walkthrough.pdf      → backfilled below (provided)
--   22 SIN Module.md                   → backfilled below (provided)
--   8  Medical Services Plan.md        → no URL provided (candidate commented below)
--   11 What is a TFSA - Canada.ca.md   → no URL provided (candidate commented below)
--   17 Goals Module.md                 → internal module, no authoritative external source
--   18 Networking Module.md            → internal module, no authoritative external source

-- SIN (provided URLs) ---------------------------------------------------------
update public.knowledge_documents
   set source_url = 'https://www.canada.ca/en/employment-social-development/services/sin.html'
 where id = 5 and source_url is null;

update public.knowledge_documents
   set source_url = 'https://www.canada.ca/en/employment-social-development/services/sin.html#module'
 where id = 22 and source_url is null;

-- Other null docs — NOT applied. Fill in / verify an authoritative URL before
-- uncommenting; a wrong link is worse than none (rag-query avoids misattribution).
-- Suggested candidates (VERIFY before use):
--
-- update public.knowledge_documents
--    set source_url = 'https://www2.gov.bc.ca/gov/content/health/health-drug-coverage/msp/bc-residents'  -- VERIFY (BC MSP)
--  where id = 8 and source_url is null;
--
-- update public.knowledge_documents
--    set source_url = 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account.html'  -- VERIFY (TFSA)
--  where id = 11 and source_url is null;
--
-- ids 17 (Goals Module) and 18 (Networking Module) are internal Unify content
-- with no external authoritative source — intentionally left NULL.
