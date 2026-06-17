-- KB source_url backfill — web project pbiszrycmcxmzxrnkkwr.
--
-- 16 of 32 knowledge_documents rows have a NULL source_url. rag-query cites a
-- chunk's source only when source_url is set (resolvedUrl = source_url || s3Url;
-- S3 is unconfigured), so these docs are used in answers but show NO citation
-- link. This sets an authoritative page for 14 of them; ids 17 (Goals) and 18
-- (Networking) stay NULL (original soft-skills content, no government source).
--
-- Unique index respected: knowledge_documents_source_url_uniq is UNIQUE on
-- (source_url) WHERE source_url IS NOT NULL. The near-duplicate "* Module.md"
-- variants reuse their base doc's URL with a `#module` fragment so each value is
-- distinct — the same convention the prior backfill used for doc 22
-- (SIN Module -> .../sin.html#module). doc 4 (tsfa.pdf) uses the TFSA topic
-- landing page so it doesn't collide with doc 11's .../what.html.
--
-- Idempotent: every UPDATE is guarded by `source_url IS NULL`, so re-running is a
-- no-op and a manually-edited value is never clobbered.
--
-- URL verification (2026-06-17): the Job Bank (19, 20) and ICBC (25) links were
-- fetched live; the FCAC savings page (16), CRA newcomers page (15) and the IRCC
-- PR-status page (23) were confirmed via search (canada.ca 403s automated fetches
-- but the pages resolve in a browser). The remaining canada.ca / gov.bc.ca links
-- are stable official pages — spot-check before applying if desired.
--
-- NOT auto-applied. Apply via the Supabase Dashboard SQL editor (MCP is read-only;
-- db push is unsafe against the drifted remote history).

begin;

-- Finance — TFSA / budgeting / banking / credit / taxes / investing (FCAC + CRA)
update knowledge_documents set source_url = 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account.html'
  where id = 4  and source_url is null;  -- tsfa.pdf — TFSA topic landing (distinct from doc 11's /what.html)
update knowledge_documents set source_url = 'https://www.canada.ca/en/financial-consumer-agency/services/make-budget.html'
  where id = 9  and source_url is null;  -- Budgeting.md
update knowledge_documents set source_url = 'https://www.canada.ca/en/financial-consumer-agency/services/make-budget.html#module'
  where id = 12 and source_url is null;  -- Budgeting Module.md — #module so it differs from doc 9
update knowledge_documents set source_url = 'https://www.canada.ca/en/financial-consumer-agency/services/banking/bank-accounts.html'
  where id = 10 and source_url is null;  -- Banking.md
update knowledge_documents set source_url = 'https://www.canada.ca/en/financial-consumer-agency/services/banking/bank-accounts.html#module'
  where id = 13 and source_url is null;  -- Banking Module.md — #module so it differs from doc 10
update knowledge_documents set source_url = 'https://www.canada.ca/en/financial-consumer-agency/services/credit-reports-score.html'
  where id = 14 and source_url is null;  -- Canadian Credit System Module.md
update knowledge_documents set source_url = 'https://www.canada.ca/en/revenue-agency/services/tax/international-non-residents/individuals-leaving-entering-canada-non-residents/newcomers-canada-immigrants.html'
  where id = 15 and source_url is null;  -- Taxes Module.md (CRA — newcomers to Canada)
update knowledge_documents set source_url = 'https://www.canada.ca/en/financial-consumer-agency/services/savings-investments.html'
  where id = 16 and source_url is null;  -- Investing Module.md

-- Employment — Job Bank (resume / interview guidance)
update knowledge_documents set source_url = 'https://www.jobbank.gc.ca/findajob/resources/write-good-resume'
  where id = 19 and source_url is null;  -- Employment Documents Module.md — "How to write a good resume" (resume-focused; cover-letter guidance lives in the broader Job Bank resources hub)
update knowledge_documents set source_url = 'https://www.jobbank.gc.ca/findajob/resources/prepare-for-interview'
  where id = 20 and source_url is null;  -- Learning How to Interview Module.md — "Preparing for an interview"

-- Health / ID / Immigration — BC gov, ICBC, IRCC
update knowledge_documents set source_url = 'https://www2.gov.bc.ca/gov/content/health/health-drug-coverage/msp/bc-residents/eligibility-and-enrolment/how-to-enrol'
  where id = 21 and source_url is null;  -- Health Documentation Module.md (BC MSP enrolment; child of doc 8's MSP landing)
update knowledge_documents set source_url = 'https://www.canada.ca/en/immigration-refugees-citizenship/services/permanent-residents/status.html'
  where id = 23 and source_url is null;  -- Immigration and Visa Documentation Module.md — "Understand permanent resident status" (module also touches permits/COPR/visa; PR status is the closest single anchor)
update knowledge_documents set source_url = 'https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/find-job/credential-recognition.html'
  where id = 24 and source_url is null;  -- Education and Work Module.md (credential recognition)
update knowledge_documents set source_url = 'https://icbc.com/driver-licensing/getting-licensed/Apply-for-a-bcid'
  where id = 25 and source_url is null;  -- Identification in BC Module.md — "Apply for a BCID card" (ICBC)

-- Intentionally left NULL (no authoritative government source — original Unify
-- soft-skills content): id 17 (Goals Module.md), id 18 (Networking Module.md).

commit;

-- Post-apply check (expect ONLY ids 17 and 18 to remain NULL):
-- select id, title, source_url from knowledge_documents
--   where source_url is null order by id;
