alter table public.agents
  add column if not exists application_answers jsonb,
  add column if not exists ai_screening_decision text,
  add column if not exists ai_screening_reason text,
  add column if not exists ai_screened_at timestamptz,
  add column if not exists approved_via text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agents_ai_screening_decision_check'
      and conrelid = 'public.agents'::regclass
  ) then
    alter table public.agents
      add constraint agents_ai_screening_decision_check
      check (ai_screening_decision is null or ai_screening_decision in ('approved', 'manual_review'));
  end if;
end $$;
