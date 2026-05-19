-- Users, onboarding profiles, and follow relationships.
-- Source: CLAUDE.md schema reference + mobile back-end schema.sql (corrected).

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
create table public.users (
  id uuid not null references auth.users on delete cascade,
  username text not null unique check (username ~ '^[a-zA-Z0-9 ]{1,20}$'),
  pronouns text,
  biography text,
  email varchar(100) not null unique,
  profile_picture_url text,
  is_premium boolean not null default false,
  permissions text not null default 'user'
    check (permissions in ('admin', 'partner', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id)
);

-- ----------------------------------------------------------------------------
-- user_onboarding_profiles — one row per user
-- ----------------------------------------------------------------------------
create table public.user_onboarding_profiles (
  id uuid primary key references public.users(id) on delete cascade,
  persona text not null
    check (persona in ('international_student', 'skilled_worker', 'refugee', 'other')),
  arrival_date date,
  city text,
  province text,
  -- stage: 0 not arrived · 1 0-3mo · 2 3-12mo · 3 1-3yr · 4 3+yr
  stage smallint not null default 0 check (stage between 0 and 4),
  goals text[] not null default '{}',
  learning_interests text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- user_followers — many-to-many follow graph
-- ----------------------------------------------------------------------------
create table public.user_followers (
  follower_id uuid not null references public.users(id) on delete cascade,
  following_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index idx_user_followers_following on public.user_followers(following_id);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.user_onboarding_profiles enable row level security;
alter table public.user_followers enable row level security;

-- users: profiles are readable by any signed-in user; a user owns their own row.
create policy "users_select" on public.users
  for select to authenticated using (true);
create policy "users_insert_own" on public.users
  for insert to authenticated with check (id = auth.uid());
create policy "users_update_own" on public.users
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- onboarding: private to the owning user.
create policy "onboarding_select_own" on public.user_onboarding_profiles
  for select to authenticated using (id = auth.uid());
create policy "onboarding_insert_own" on public.user_onboarding_profiles
  for insert to authenticated with check (id = auth.uid());
create policy "onboarding_update_own" on public.user_onboarding_profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- followers: the graph is readable; a user manages only their own follows.
create policy "followers_select" on public.user_followers
  for select to authenticated using (true);
create policy "followers_insert_own" on public.user_followers
  for insert to authenticated with check (follower_id = auth.uid());
create policy "followers_delete_own" on public.user_followers
  for delete to authenticated using (follower_id = auth.uid());
