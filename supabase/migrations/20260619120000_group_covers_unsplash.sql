-- Group cover photos → curated Unsplash images (per-topic, warm/inclusive/modern).
--
-- Replaces the arbitrary external cover URLs (cloudfront, spergel.ca, gstatic,
-- freepik, …) on the 14 live `groups` rows with stable Unsplash CDN URLs that
-- match each group's topic. Each URL was verified to return HTTP 200 image/jpeg.
--
-- Shared prod DB (web + mobile) — apply via the Supabase Dashboard SQL editor
-- (the MCP is read-only and `db push` is unsafe against the drifted remote
-- history). Idempotent: re-running just re-sets the same URLs by id. The web
-- app must allowlist `images.unsplash.com` in next.config.ts for next/image.

update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80&auto=format&fit=crop'
where id = 4;  -- Tech Enthusiasts
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=800&q=80&auto=format&fit=crop'
where id = 5;  -- Book Club
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&q=80&auto=format&fit=crop'
where id = 7;  -- Housing Assistance
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?w=800&q=80&auto=format&fit=crop'
where id = 11;  -- International Students
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=800&q=80&auto=format&fit=crop'
where id = 12;  -- PR Applicants
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=800&q=80&auto=format&fit=crop'
where id = 13;  -- Working in Canada
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=800&q=80&auto=format&fit=crop'
where id = 14;  -- English Practice and Conversation
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80&auto=format&fit=crop'
where id = 15;  -- Banking, Credit, and Taxes
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=800&q=80&auto=format&fit=crop'
where id = 16;  -- Parents and Families
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1614064641938-3bbee52942c7?w=800&q=80&auto=format&fit=crop'
where id = 17;  -- Scam Alerts and Safety
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80&auto=format&fit=crop'
where id = 18;  -- Food Club
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=800&q=80&auto=format&fit=crop'
where id = 19;  -- Newcomer Wins
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1715093974416-b52c38bf982b?w=800&q=80&auto=format&fit=crop'
where id = 20;  -- Movie Club
update public.groups set cover_photo_url = 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&q=80&auto=format&fit=crop'
where id = 21;  -- Music Club
