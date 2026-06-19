-- Group cover photos → curated Unsplash images (per-topic, warm/inclusive/modern).
--
-- ALREADY APPLIED to the shared DB (`wrbauxutkysljmsqojts`) via the Dashboard SQL editor —
-- this file is kept for version-control / reference only; do not re-run blindly. (The MCP is
-- read-only and `db push` is unsafe against the drifted remote history.)
--
-- Replaces the arbitrary external cover URLs (cloudfront, spergel.ca, gstatic, freepik, …) on
-- the 14 live `groups` rows with stable Unsplash CDN URLs that match each group's topic; each
-- URL was verified to return HTTP 200 image/jpeg. Every statement guards on both `id` AND
-- `group_name` so a re-run can't touch the wrong row if ids ever shift. The web app must
-- allowlist `images.unsplash.com` in next.config.ts for next/image.

update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80&auto=format&fit=crop'
where id = 4 and group_name = 'Tech Enthusiasts';  -- Tech Enthusiasts
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=800&q=80&auto=format&fit=crop'
where id = 5 and group_name = 'Book Club';  -- Book Club
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&q=80&auto=format&fit=crop'
where id = 7 and group_name = 'Housing Assistance';  -- Housing Assistance
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?w=800&q=80&auto=format&fit=crop'
where id = 11 and group_name = 'International Students';  -- International Students
-- id 12's stored group_name carries a trailing newline ("PR Applicants\n") — a data quirk on
-- the live row; the E'' escape literal matches it exactly (plain 'PR Applicants' would not).
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=800&q=80&auto=format&fit=crop'
where id = 12 and group_name = E'PR Applicants\n';  -- PR Applicants
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=800&q=80&auto=format&fit=crop'
where id = 13 and group_name = 'Working in Canada';  -- Working in Canada
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=800&q=80&auto=format&fit=crop'
where id = 14 and group_name = 'English Practice and Conversation';  -- English Practice and Conversation
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80&auto=format&fit=crop'
where id = 15 and group_name = 'Banking, Credit, and Taxes';  -- Banking, Credit, and Taxes
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&q=80&auto=format&fit=crop'
where id = 16 and group_name = 'Parents and Families';  -- Parents and Families
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1614064641938-3bbee52942c7?w=800&q=80&auto=format&fit=crop'
where id = 17 and group_name = 'Scam Alerts and Safety';  -- Scam Alerts and Safety
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80&auto=format&fit=crop'
where id = 18 and group_name = 'Food Club';  -- Food Club
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=800&q=80&auto=format&fit=crop'
where id = 19 and group_name = 'Newcomer Wins';  -- Newcomer Wins
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1715093974416-b52c38bf982b?w=800&q=80&auto=format&fit=crop'
where id = 20 and group_name = 'Movie Club';  -- Movie Club
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&q=80&auto=format&fit=crop'
where id = 21 and group_name = 'Music Club';  -- Music Club
