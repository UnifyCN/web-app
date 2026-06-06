-- Extra onboarding fields — bring the web wizard to parity with the 11-step
-- mobile flow: first name, referral source, hobbies, and a learning-reminder
-- opt-in. Additive and backward-compatible: existing rows take the defaults,
-- and the nullable columns satisfy the CHECK (NULL passes a CHECK constraint).
-- RLS own-row policies and API-role grants on user_onboarding_profiles already
-- cover these columns — nothing else to add.

alter table public.user_onboarding_profiles
  add column if not exists first_name text,
  add column if not exists referral_source text
    check (referral_source in (
      'facebook_instagram', 'google_search', 'app_store',
      'friends_family', 'news_article', 'tiktok', 'other'
    )),
  add column if not exists hobbies text[] not null default '{}',
  add column if not exists learning_reminders boolean not null default false;
