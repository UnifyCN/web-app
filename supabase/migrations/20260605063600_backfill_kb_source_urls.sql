-- Backfill knowledge_documents.source_url for imported content docs.
--
-- The rag-query edge function builds each response "source" link as
--   source_url || s3Url || '<generic IRCC fallback>'
-- (lib: supabase/functions/rag-query/index.ts). S3 is unconfigured, so any doc
-- with a NULL source_url surfaces the hardcoded generic IRCC immigration page
-- (https://www.canada.ca/en/immigration-refugees-citizenship.html) — generic and,
-- for non-IRCC topics, wrong. Example bug: "How do I apply for a SIN?" retrieves
-- the real SIN application guide (doc 5) but shows the generic IRCC link, because
-- SIN is administered by ESDC / Service Canada, not IRCC.
--
-- Retrieval itself is healthy (SIN chunks cluster ~0.85-0.94 cosine, well above the
-- 0.3 threshold); this only fixes the source-link plumbing.
--
-- URLs below are the canonical pages, taken from each doc's own chunk_text where
-- present (doc 5 chunk 24 for SIN; doc 8 and doc 11 chunks for MSP and TFSA).
-- Internal Unify "*Module.md" docs have no external canonical source and are left
-- NULL on purpose (id 4 tsfa.pdf has no URL in its text; id 12 only references an
-- external calculator, not a source).
--
-- Idempotent: each UPDATE is guarded by `source_url IS NULL`, so re-applying the
-- migration or a later manual edit is never clobbered.

-- SIN — the reported bug. Both the scanned application guide (doc 5) and the SIN
-- learning module (doc 22) point at the official ESDC SIN landing page.
update public.knowledge_documents
set source_url = 'https://www.canada.ca/en/employment-social-development/services/sin.html'
where id in (5, 22)
  and source_url is null;

-- BC Medical Services Plan (doc 8) — canonical gov.bc.ca MSP page (found in chunks).
update public.knowledge_documents
set source_url = 'https://www2.gov.bc.ca/gov/content/health/health-drug-coverage/msp'
where id = 8
  and source_url is null;

-- TFSA (doc 11) — canonical CRA "What is a TFSA" page (found in chunks).
update public.knowledge_documents
set source_url = 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account/what.html'
where id = 11
  and source_url is null;
