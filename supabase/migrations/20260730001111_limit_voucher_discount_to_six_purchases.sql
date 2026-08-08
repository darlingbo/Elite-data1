create table if not exists public.voucher_discount_redemptions (
  payment_reference text primary key,
  discount_code text not null,
  redeemed_at timestamptz not null default now()
);

alter table public.voucher_discount_redemptions enable row level security;

insert into public.system_settings (key, value, updated_at)
values
  ('voucher_discount_max_uses', '6', now())
on conflict (key) do update
set value = excluded.value, updated_at = excluded.updated_at;

delete from public.voucher_discount_redemptions
where discount_code = 'WERGH123';

create or replace function public.claim_voucher_discount(
  p_code text,
  p_payment_reference text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  configured_code text;
  max_uses integer;
  existing_code text;
  used_count integer;
begin
  if nullif(trim(p_code), '') is null or nullif(trim(p_payment_reference), '') is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('voucher-discount:' || upper(trim(p_code)), 0));

  select discount_code into existing_code
  from public.voucher_discount_redemptions
  where payment_reference = trim(p_payment_reference);

  if found then
    return existing_code = upper(trim(p_code));
  end if;

  select upper(trim(value)) into configured_code
  from public.system_settings
  where key = 'voucher_discount_code';

  select greatest(0, value::integer) into max_uses
  from public.system_settings
  where key = 'voucher_discount_max_uses';

  if configured_code is null
     or configured_code <> upper(trim(p_code))
     or coalesce(max_uses, 0) = 0 then
    return false;
  end if;

  select count(*) into used_count
  from public.voucher_discount_redemptions
  where discount_code = configured_code;

  if used_count >= max_uses then
    return false;
  end if;

  insert into public.voucher_discount_redemptions (payment_reference, discount_code)
  values (trim(p_payment_reference), configured_code);

  return true;
end;
$$;

revoke all on table public.voucher_discount_redemptions from anon, authenticated;
revoke execute on function public.claim_voucher_discount(text, text) from public, anon, authenticated;
grant select, insert on table public.voucher_discount_redemptions to service_role;
grant execute on function public.claim_voucher_discount(text, text) to service_role;
