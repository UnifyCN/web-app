-- ############################################################################
-- ##  ONE-OFF DATA FIX — NOT A SCHEMA MIGRATION.                            ##
-- ##  Do not put this in supabase/migrations/ and do not expect it to run    ##
-- ##  as part of any migration sequence. It changes rows, never DDL.         ##
-- ############################################################################
--
-- Backfills public.events.genre for crawler rows that predate genre tagging.
--
-- WHY THIS EXISTS
-- `genre` is a pre-existing shared column (default 'Uncategorized') that nothing
-- ever populated. The events-crawler now classifies every event it ingests (see
-- GENRE_RULES in supabase/functions/events-crawler/index.ts), but the ~70 rows it
-- inserted before that shipped are stuck at 'Uncategorized' and a re-crawl will
-- never revisit them: the events_external_link_key unique index plus
-- `upsert(..., { ignoreDuplicates: true })` means an already-seen link is skipped,
-- not updated. Without this file those rows stay untagged until they age out of
-- the 4-month window — long enough for 'Other' to dominate the Events filter.
--
-- HOW IT WAS GENERATED
-- Mechanically, from the 9 live GENRE_RULES in the edge function, with JS `\b`
-- rewritten to POSIX `\m` / `\M`. The two-pass structure below (title first,
-- description as tiebreaker) mirrors genreForEvent() exactly, so a row backfilled
-- here gets the same tag the crawler would have given it. If the rules change,
-- regenerate rather than hand-editing — otherwise the two silently diverge.
--
-- SCOPE GUARD
-- `source like 'crawler:%'` — rows entered by hand (source IS NULL) are never
-- touched. This runs against the SHARED prod DB that the live mobile app reads.
--
-- SAFE TO RE-RUN. It only reads rows already at 'Uncategorized' and only writes a
-- non-'Uncategorized' value, so a second run is a no-op over rows it already fixed.
--
-- APPLY BY HAND in the Dashboard SQL editor (the MCP is read-only).
--
-- TO REVERT:
--   update public.events set genre = 'Uncategorized' where source like 'crawler:%';
--
-- STATUS: NOT YET APPLIED as of 2026-07-28. Dry-run against prod on that date
-- classified all 70 in-scope rows with none left over:
--   Employment 17 · Socials 17 · Language 13 · Health 11 · Family 5
--   Education 3 · Housing 2 · Finance 1 · Documentation 1
-- Expect `UPDATE 70`. Update this line once it has run.


-- ---------------------------------------------------------------------------
-- INSPECT FIRST (optional): same logic as a read-only preview of what changes.
-- Swap the trailing UPDATE for this to see the distribution before committing.
-- ---------------------------------------------------------------------------
-- select genre as would_become, count(*) as rows
--   from classified group by genre order by rows desc;


with r(ord, genre, re) as (values
  (1, 'Employment', 'job|career|employ|resume|hiring|worksafe|workplace|interview|credential|licens|internationally (educated|trained)|profession|nurse|physician|labour market'),
  (2, 'Language', 'english|\mesl\M|\mlinc\M|language|conversation circle|french|francais'),
  (3, 'Housing', 'housing|rental|renting|tenant|landlord|lease|shelter|homeless'),
  (4, 'Finance', 'tax|bank|budget|financ|money|credit|benefit|insurance|pension|income|subsid|rrsp|tfsa|debt|saving'),
  (5, 'Documentation', 'immigration|citizenship|permanent resident|pr card|work permit|study permit|sin card|legal|lawyer|notary|settlement|orientation|document|visa'),
  (6, 'Health', 'health|clinic|wellness|mental|counsel|cancer|screening|nutrition|dental|emotion|stress|mindful|yoga|tai chi|qi gong|exercise|fitness|walkathon|memory|dementia|therapy|doctor|medical|wellbeing'),
  (7, 'Family', 'famil|child|kid|parent|youth|toddler|baby|preschool|caregiver|prenatal|daycare'),
  (8, 'Education', 'digital|computer|tech|literacy|skill|training|course|tutor|school|scholarship'),
  (9, 'Socials', 'social|communit|cafe|café|club|dance|mahjong|party|celebrat|potluck|festival|connect|meetup|drop-?in|peer|volunteer|friend|game|craft|garden|coffee|lunch|dinner|cook|meal|kitchen|immigrant|refugee|newcomer|explore|tour\M|trip\M|outing|excursion|museum|farm|winery|orchard|hike|picnic|market|sightsee')
),
ev as (
  select id,
         lower(title) as t,
         lower(left(coalesce(description, ''), 400)) as d
  from public.events
  where source like 'crawler:%'
    and genre = 'Uncategorized'
),
classified as (
  select ev.id,
         coalesce(
           (select r.genre from r where ev.t ~ r.re order by r.ord limit 1),
           (select r.genre from r where ev.d ~ r.re order by r.ord limit 1),
           'Uncategorized'
         ) as genre
  from ev
)
update public.events e
   set genre = c.genre
  from classified c
 where e.id = c.id
   and c.genre <> 'Uncategorized';
