-- Companion (AI chat) — conversations, messages, and usage tracking.
-- Source: CLAUDE.md schema reference + mobile back-end conversations schema.

-- ----------------------------------------------------------------------------
-- conversations
-- ----------------------------------------------------------------------------
create table public.conversations (
  id bigint generated always as identity primary key,
  conversation_identifier uuid not null unique default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_conversations_user_updated
  on public.conversations(user_id, updated_at desc);

-- ----------------------------------------------------------------------------
-- messages — sources holds RAG citations as JSONB
-- ----------------------------------------------------------------------------
create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb,
  created_at timestamptz not null default now()
);

create index idx_messages_conversation
  on public.messages(conversation_id, created_at asc);

-- ----------------------------------------------------------------------------
-- chatbot_usage — daily rate-limit counter (upsert-only)
-- ----------------------------------------------------------------------------
create table public.chatbot_usage (
  user_id uuid primary key references public.users(id) on delete cascade,
  message_count integer not null default 0,
  last_message_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Trigger — bump conversations.updated_at when a message is added
-- ----------------------------------------------------------------------------
create or replace function public.update_conversation_timestamp()
returns trigger as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_message_insert_update_conversation
  after insert on public.messages
  for each row execute function public.update_conversation_timestamp();

-- ----------------------------------------------------------------------------
-- Row Level Security — all rows are private to the owning user
-- ----------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.chatbot_usage enable row level security;

create policy "conversations_select_own" on public.conversations
  for select to authenticated using (user_id = auth.uid());
create policy "conversations_insert_own" on public.conversations
  for insert to authenticated with check (user_id = auth.uid());
create policy "conversations_update_own" on public.conversations
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "conversations_delete_own" on public.conversations
  for delete to authenticated using (user_id = auth.uid());

-- messages: scoped through the parent conversation's owner.
create policy "messages_select_own" on public.messages
  for select to authenticated using (
    exists (select 1 from public.conversations c
            where c.id = conversation_id and c.user_id = auth.uid())
  );
create policy "messages_insert_own" on public.messages
  for insert to authenticated with check (
    exists (select 1 from public.conversations c
            where c.id = conversation_id and c.user_id = auth.uid())
  );
create policy "messages_delete_own" on public.messages
  for delete to authenticated using (
    exists (select 1 from public.conversations c
            where c.id = conversation_id and c.user_id = auth.uid())
  );

create policy "chatbot_usage_select_own" on public.chatbot_usage
  for select to authenticated using (user_id = auth.uid());
create policy "chatbot_usage_insert_own" on public.chatbot_usage
  for insert to authenticated with check (user_id = auth.uid());
create policy "chatbot_usage_update_own" on public.chatbot_usage
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
