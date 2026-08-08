create table if not exists public.result_checker_requests (
  id uuid primary key default gen_random_uuid(),
  order_reference text not null unique,
  exam_type text not null check (exam_type in ('BECE','WASSCE')),
  candidate_type text not null check (candidate_type in ('school','private')),
  candidate_name text not null,
  index_number text not null,
  exam_year integer not null check (exam_year between 1990 and 2100),
  date_of_birth date,
  whatsapp text not null,
  status text not null default 'awaiting_approval' check (status in ('awaiting_approval','awaiting_result','completed')),
  consented_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists result_checker_requests_status_created_idx on public.result_checker_requests(status, created_at desc);
alter table public.result_checker_requests enable row level security;
revoke all on table public.result_checker_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.result_checker_requests to service_role;
