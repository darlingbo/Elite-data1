-- Atomically claim an order for fulfillment while preventing a second order
-- for the same recipient number from reaching a delivery provider.
create or replace function public.claim_order_for_fulfillment(
  p_reference text,
  p_channel text
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_phone text;
  v_duplicate_reference text;
begin
  select *
    into v_order
    from public.orders
   where reference = p_reference
   for update;

  if not found then
    return 'not_found';
  end if;

  if v_order.status <> 'pending_approval' then
    return 'already_' || v_order.status;
  end if;

  v_phone := regexp_replace(coalesce(v_order.phone, ''), '[^0-9]', '', 'g');
  if v_phone like '233%' then
    v_phone := '0' || substr(v_phone, 4);
  end if;

  -- Serialize approval attempts for this recipient, including simultaneous
  -- Telegram/dashboard/automatic approvals.
  perform pg_advisory_xact_lock(hashtextextended(v_phone, 0));

  select candidate.reference
    into v_duplicate_reference
    from public.orders candidate
   where candidate.reference <> v_order.reference
     and (
       case
         when regexp_replace(coalesce(candidate.phone, ''), '[^0-9]', '', 'g') like '233%'
           then '0' || substr(regexp_replace(candidate.phone, '[^0-9]', '', 'g'), 4)
         else regexp_replace(coalesce(candidate.phone, ''), '[^0-9]', '', 'g')
       end
     ) = v_phone
     and candidate.created_at >= v_order.created_at - interval '10 minutes'
     and (
       candidate.created_at < v_order.created_at
       or (candidate.created_at = v_order.created_at and candidate.reference < v_order.reference)
     )
     and candidate.status in ('pending', 'pending_approval', 'processing', 'completed')
   order by candidate.created_at asc, candidate.reference asc
   limit 1;

  if v_duplicate_reference is not null then
    update public.orders
       set status = 'duplicate_blocked',
           approved_at = null,
           approved_via = p_channel,
           fulfillment_started_at = null,
           provider_used = null
     where reference = p_reference
       and status = 'pending_approval';
    return 'duplicate_blocked:' || v_duplicate_reference;
  end if;

  update public.orders
     set status = 'processing',
         approved_at = now(),
         approved_via = p_channel,
         fulfillment_started_at = now()
   where reference = p_reference
     and status = 'pending_approval';

  if found then
    return 'claimed';
  end if;
  return 'claim_failed';
end;
$$;

revoke execute on function public.claim_order_for_fulfillment(text, text) from public, anon, authenticated;
grant execute on function public.claim_order_for_fulfillment(text, text) to service_role;
