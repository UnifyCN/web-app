-- Phase 18 — Community: news content.
-- The news_details table was already wired (services/community.ts getNews) but
-- empty, so production showed "No news yet." Add a `link` column (source
-- article URL — there is no in-app news detail page, so items link out) and
-- seed the real articles ported from the mobile backend.
--
-- Existing RLS (news_select: authenticated read) and grants (anon/authenticated
-- SELECT) cover the new column; no policy change needed.
-- Idempotent: each row inserts only if its title isn't already present.

alter table public.news_details add column if not exists link text;

insert into public.news_details
  (title, description, author, category, date, image_link, link)
select v.title, v.description, v.author, v.category, v.date, v.image_link, v.link
from (
  values
    (
      'Navigating Winter Roads in Canada',
      'New to snow? ICBC article to help you avoid issues on the icy, winter roads. Learn essential winter driving tips and safety precautions.',
      'ICBC',
      null::text,
      timestamptz '2024-12-15 10:00:00+00',
      'https://media.canadianunderwriter.ca/uploads/2017/10/iStock-636598208.jpg',
      'https://www.icbc.com/driver-licensing/winter-driving'
    ),
    (
      'Financial Planning Tips for Newcomers',
      'Essential tips for managing your finances in Canada. Learn about banking, credit, taxes, and budgeting strategies.',
      'Financial Advisor',
      null,
      timestamptz '2024-12-10 14:30:00+00',
      'https://www.bankrate.com/2023/06/27140300/What-is-financial-planning-SEO-NEW-ARTICLE-.jpeg?auto=webp&optimize=high&crop=16:9',
      'https://www.canada.ca/en/financial-consumer-agency.html'
    ),
    (
      'Understanding Canadian Healthcare System',
      'A comprehensive guide to navigating the Canadian healthcare system and understanding your coverage options.',
      'Health Canada',
      null,
      timestamptz '2024-12-05 09:15:00+00',
      'https://www.heritage.org/sites/default/files/styles/facebook_optimized/public/images/2020-02/GettyImages-1178057952.jpg?itok=6OFC17zR4',
      'https://www.canada.ca/en/health-canada/services/health-care-system.html'
    ),
    (
      'Complete Guide to Settling in Canada',
      'A comprehensive resource covering all aspects of life in Canada for newcomers, from housing to employment to social integration.',
      'Immigration Services Canada',
      null,
      timestamptz '2024-11-28 16:45:00+00',
      'https://www.cicnews.com/wp-content/uploads/2023/06/WES-ECA-1024x683.jpg',
      'https://www.canada.ca/en/immigration-refugees-citizenship/services/new-immigrants.html'
    )
) as v(title, description, author, category, date, image_link, link)
where not exists (
  select 1 from public.news_details d where d.title = v.title
);
