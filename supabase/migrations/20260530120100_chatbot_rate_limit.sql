-- Server-side daily rate limit for the Companion AI.
--
-- The rag-query edge function calls this RPC once per message (fail-closed):
-- it atomically increments the caller's daily message_count and returns false
-- when the cap is exceeded, so the function can return 429. Premium users are
-- never limited. Adapted from the mobile app's check_and_increment_chatbot_usage
-- to the web chatbot_usage schema (user_id, message_count, last_message_at) —
-- no token/cost columns here (analytics disabled on web).

create or replace function public.check_and_increment_chatbot_usage(
  p_user_id uuid,
  p_daily_limit int default 3
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_premium boolean;
  v_count int;
  v_today date := (now() at time zone 'utc')::date;
begin
  select is_premium into v_is_premium from public.users where id = p_user_id;

  -- Upsert the usage row; reset the count on a new UTC day.
  insert into public.chatbot_usage (user_id, message_count, last_message_at)
  values (p_user_id, 1, now())
  on conflict (user_id) do update
    set message_count = case
          when (public.chatbot_usage.last_message_at at time zone 'utc')::date < v_today
            then 1
          else public.chatbot_usage.message_count + 1
        end,
        last_message_at = now()
  returning message_count into v_count;

  -- Premium users are never rate-limited.
  if coalesce(v_is_premium, false) then
    return true;
  end if;

  -- Over the cap → roll back this increment and deny (caps the stored count at
  -- the limit so the UI's "remaining" reads 0 rather than going negative).
  if v_count > p_daily_limit then
    update public.chatbot_usage
      set message_count = message_count - 1
      where user_id = p_user_id;
    return false;
  end if;

  return true;
end;
$$;

-- The edge function calls this with the service-role key; grant authenticated
-- too in case it's ever invoked directly under RLS.
grant execute on function public.check_and_increment_chatbot_usage(uuid, int)
  to service_role, authenticated;
