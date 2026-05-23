-- Community content — events, news, circles, and notifications.
-- Source: CLAUDE.md schema reference + mobile back-end events table.

-- ----------------------------------------------------------------------------
-- events
-- ----------------------------------------------------------------------------
create table public.events (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  event_datetime timestamptz not null,
  event_end_datetime timestamptz,
  location text not null,
  address text,
  hosted_by text,
  event_type text not null check (event_type in ('in-person', 'online', 'hybrid')),
  cover_photo_url text,
  external_link text,
  max_attendees integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- news_details
-- ----------------------------------------------------------------------------
create table public.news_details (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  author text,
  category text,
  date timestamptz not null default now(),
  image_link text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- community_circles — small matched newcomer groups
-- ----------------------------------------------------------------------------
create table public.community_circles (
  id uuid primary key default gen_random_uuid(),
  persona text not null
    check (persona in ('international_student', 'skilled_worker', 'refugee', 'other')),
  -- time_in_canada mirrors the onboarding stage scale (0-4)
  time_in_canada smallint not null check (time_in_canada between 0 and 4),
  goal text,
  topics text[] not null default '{}',
  status text not null default 'default'
    check (status in ('default', 'waiting', 'in_circle')),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- community_notifications
-- ----------------------------------------------------------------------------
create table public.community_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_user on public.community_notifications(user_id);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.events enable row level security;
alter table public.news_details enable row level security;
alter table public.community_circles enable row level security;
alter table public.community_notifications enable row level security;

-- events / news: read-only content (no write policy -> writes blocked via the API).
create policy "events_select" on public.events
  for select to authenticated using (true);
create policy "news_select" on public.news_details
  for select to authenticated using (true);

-- circles: readable by signed-in users; created/updated by the matching backend.
create policy "circles_select" on public.community_circles
  for select to authenticated using (true);

-- notifications: private — owner reads and marks their own as read.
create policy "notifications_select_own" on public.community_notifications
  for select to authenticated using (user_id = auth.uid());
create policy "notifications_update_own" on public.community_notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
