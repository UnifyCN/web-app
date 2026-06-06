-- Constrain daily_tips.stage to the canonical Stage vocabulary ('0'..'4').
-- daily_tips already exists in prod, so this is an additive ALTER (not an edit
-- to the original migration). stage is nullable and a CHECK passes on NULL, so
-- existing rows and NULL writes are unaffected.
alter table public.daily_tips
  add constraint daily_tips_stage_check check (stage in ('0', '1', '2', '3', '4'));
