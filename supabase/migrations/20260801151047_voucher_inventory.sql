create table public.voucher_inventory (
  id bigint generated always as identity primary key,
  voucher_type text not null check (voucher_type in ('BECE', 'WASSCE')),
  code text not null check (length(btrim(code)) > 0),
  status text not null default 'available' check (status in ('available', 'assigned', 'sent')),
  order_reference text,
  created_at timestamptz not null default now(),
  assigned_at timestamptz,
  sent_at timestamptz,
  constraint voucher_inventory_type_code_key unique (voucher_type, code)
);

create index voucher_inventory_available_idx
  on public.voucher_inventory (voucher_type, id)
  where status = 'available';

create index voucher_inventory_order_idx
  on public.voucher_inventory (order_reference)
  where order_reference is not null;

alter table public.voucher_inventory enable row level security;
revoke all on table public.voucher_inventory from public, anon, authenticated;
revoke all on sequence public.voucher_inventory_id_seq from public, anon, authenticated;
grant select, insert, update, delete on table public.voucher_inventory to service_role;
grant usage, select on sequence public.voucher_inventory_id_seq to service_role;

create or replace function public.assign_vouchers_to_order(
  p_order_reference text,
  p_voucher_type text,
  p_quantity integer
)
returns table (id bigint, code text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ids bigint[];
  v_existing_count integer;
begin
  if p_voucher_type not in ('BECE', 'WASSCE') or p_quantity < 1 or p_quantity > 20 then
    raise exception 'Invalid voucher allocation request';
  end if;

  select count(*)::integer
    into v_existing_count
    from public.voucher_inventory inventory
   where inventory.order_reference = p_order_reference;

  if v_existing_count > 0 then
    if v_existing_count <> p_quantity then
      raise exception 'Voucher allocation for this order has an unexpected quantity';
    end if;
    return query
      select inventory.id, inventory.code
        from public.voucher_inventory inventory
       where inventory.order_reference = p_order_reference
       order by inventory.id;
    return;
  end if;

  select array_agg(available.id order by available.id)
    into v_ids
    from (
      select inventory.id
        from public.voucher_inventory inventory
       where inventory.voucher_type = p_voucher_type
         and inventory.status = 'available'
       order by inventory.id
       limit p_quantity
       for update skip locked
    ) available;

  if coalesce(cardinality(v_ids), 0) <> p_quantity then
    raise exception 'Not enough % vouchers in stock. Need %, available %',
      p_voucher_type, p_quantity, coalesce(cardinality(v_ids), 0);
  end if;

  return query
    update public.voucher_inventory inventory
       set status = 'assigned',
           order_reference = p_order_reference,
           assigned_at = now()
     where inventory.id = any(v_ids)
     returning inventory.id, inventory.code;
end;
$$;

revoke execute on function public.assign_vouchers_to_order(text, text, integer) from public, anon, authenticated;
grant execute on function public.assign_vouchers_to_order(text, text, integer) to service_role;
