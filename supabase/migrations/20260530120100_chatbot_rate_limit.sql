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
  -- Defense in depth: this is SECURITY DEFINER, so restrict who it can act for.
  -- The edge function calls it with the service-role key (auth.uid() is NULL),
  -- which is exempt; any other caller may only touch their own usage row.
  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is distinct from p_user_id then
    raise exception 'not authorized to modify usage for another user';
  end if;

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

-- Only the edge function (service-role key) may call this. No authenticated
-- grant: a direct client must never be able to burn another user's quota.
revoke execute on function public.check_and_increment_chatbot_usage(uuid, int)
  from authenticated;
grant execute on function public.check_and_increment_chatbot_usage(uuid, int)
  to service_role;

-- Compensating decrement: the edge function calls this to refund one message
-- when generation fails after the daily count was already incremented (so a
-- transient provider/DB error doesn't burn one of the user's 3 daily messages).
-- Same service-role-aware guard; floors at 0; service_role only.
create or replace function public.decrement_chatbot_usage(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and auth.uid() is distinct from p_user_id then
    raise exception 'not authorized to modify usage for another user';
  end if;

  update public.chatbot_usage
    set message_count = greatest(message_count - 1, 0)
    where user_id = p_user_id;
end;
$$;

grant execute on function public.decrement_chatbot_usage(uuid) to service_role;
