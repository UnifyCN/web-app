-- Seed real community groups (exported from the mobile Supabase DB).
--
-- Idempotent: `group_name` has a UNIQUE constraint (groups_group_name_key), so
-- `on conflict (group_name) do nothing` inserts only groups not already present.
-- `id` is GENERATED ALWAYS AS IDENTITY, so it is not set here (the web DB is
-- standalone and dedups by name, not by mobile's ids); `created_at` is preserved
-- because getGroups orders by it. CSV trailing newlines on names/descriptions
-- are trimmed.
--
-- NOTE: cover_photo_url hosts are allowlisted in next.config.ts (next/image via
-- GroupCover). As with the Phase 18 news seed, if the Supabase MCP is read-only
-- this is applied via the dashboard SQL editor instead.

insert into public.groups (group_name, group_description, member_count, cover_photo_url, created_at)
values
  ('Tech Enthusiasts', 'A group for people passionate about technology.', 15, 'https://d2nzy1qhita6w.cloudfront.net/media/magefan_blog/five_emerging_trends_innovative_technology.jpeg', '2025-09-26 08:35:25.220049+00'),
  ('Book Club', 'Discuss your favorite books and authors.', 16, 'https://wpvip.edutopia.org/wp-content/uploads/2022/10/iStock-583816330-crop.jpg?w=2880&quality=85', '2025-09-26 08:35:25.220049+00'),
  ('Housing Assistance', 'A group for people who want advice regarding housing options and different tips and tricks', 15, 'https://www.fresnocountyca.gov/files/sharedassets/county/v/3/social-services/assistance-programs/housing.jpg?w=1200', '2025-10-11 21:33:43+00'),
  ('International Students', 'A space for international students in Canada to ask questions, share experiences, and support each other through school, work, and life outside the classroom. Topics include study permits, part-time work, housing, campus life, and pathways after graduation.', 14, 'https://www.princeton.edu/sites/default/files/styles/1x_full_2x_half_crop/public/images/2023/04/20220212_DavisIC_0257.jpg?itok=5C3vJV5T', '2026-01-06 20:05:23.611982+00'),
  ('PR Applicants', 'For anyone navigating Express Entry, PNPs, work permits, and PR timelines.', 17, 'https://dmandelbaum.com/wp-content/uploads/2021/01/permanent-residents-canada.jpg', '2026-01-06 20:15:34.516734+00'),
  ('Working in Canada', 'Discussions around finding jobs, workplace culture, resumes, interviews, and employment rights.', 19, 'https://immigration.ca/wp-content/uploads/2021/09/Graduates-Essential-Workers_216222241-scaled-1.jpeg', '2026-01-06 20:16:10.18115+00'),
  ('English Practice and Conversation', 'A friendly space to practice English, share resources, and find conversation partners without pressure.', 6, 'https://www.internations.org/content-assets/static/2f04e486f53221159daf5da052050801/5445c/ExpatExpert_Language_LearningTips3.jpg', '2026-02-12 07:08:40.152518+00'),
  ('Banking, Credit, and Taxes', 'Build credit, choose accounts and cards, and get ready for tax season with simple explanations.', 4, 'https://www.spergel.ca/wp-content/uploads/2025/08/AdobeStock_171187293-1-scaled-1.jpeg', '2026-02-12 07:09:22.018373+00'),
  ('Parents and Families', 'Childcare, schools, family resources, and day-to-day support for parents settling in a new place.', 1, 'https://nyonyalicious.com.au/prod/wp-content/uploads/2019/01/02A169GE.jpg', '2026-02-12 07:09:52.437795+00'),
  ('Scam Alerts and Safety', 'Share common scams, housing red flags, and tips to stay safe online and in the community.', 2, 'https://public-files.hoa-express.com/website-1023074896/pages/page-1826770896/4MzFve9sf8BVk8z8.png', '2026-02-12 07:10:35.369502+00'),
  ('Food Club', 'Swap restaurant recs, halal/veg finds, cultural food spots, and places that feel like home.', 14, 'https://canadianfoodfocus.org/wp-content/uploads/2021/03/cultural-cuisine-1024x576.jpg', '2026-02-12 07:11:34.61406+00'),
  ('Newcomer Wins', 'Share your weekly win, big or small, and hype others up with encouragement and tips.', 9, 'https://img.freepik.com/premium-vector/small-win-achievement-motivate-achieve-bigger-goal-strategy-inspiration-success_212586-2020.jpg', '2026-02-12 07:12:11.342339+00'),
  ('Movie Club', 'Vote on a movie, watch together, or drop quick reviews and discussion threads.', 9, 'https://www.wondermind.com/wp-content/uploads/2024/09/20-Feel-Good-Movies-People-Swear-By-For-Your-Next-Bad-Day.jpg?w=960', '2026-02-12 07:13:14.553538+00'),
  ('Music Club', 'Share playlists, discover new artists, and discuss music!', 13, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR1HCMJ-mJYGDrwSAi9n5QwOU2f1Ale_yTH4Q&s', '2026-02-12 07:13:48.927291+00')
on conflict (group_name) do nothing;
