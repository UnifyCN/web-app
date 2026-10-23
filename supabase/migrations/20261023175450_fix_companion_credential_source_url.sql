-- Replace the retired credential-recognition page used by Companion citations.
-- Verified 2026-10-23: the old IRCC URL returns 404 and the ESDC page returns 200.
--
-- The identity and old-URL guards make this migration replay-safe and prevent it
-- from overwriting a later editorial correction.

begin;

update public.knowledge_documents
set source_url = 'https://www.canada.ca/en/employment-social-development/programs/foreign-credential-recognition.html'
where id = 24
  and title = 'Education and Work Module.md'
  and source_url = 'https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/find-job/credential-recognition.html';

commit;
