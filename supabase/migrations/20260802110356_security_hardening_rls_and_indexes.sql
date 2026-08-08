drop policy if exists "public can read bundle_prices" on public.bundle_prices;
drop policy if exists "admin_manage_prices" on public.bundle_prices;
drop policy if exists "public can read mashup_bundles" on public.mashup_bundles;

drop policy if exists "authenticated_read_active_bundles" on public.bundle_prices;
create policy "authenticated_read_active_bundles" on public.bundle_prices
  for select to authenticated using (active = true);
drop policy if exists "authenticated_read_active_mashup_bundles" on public.mashup_bundles;
create policy "authenticated_read_active_mashup_bundles" on public.mashup_bundles
  for select to authenticated using (active = true);

alter policy "profiles_select_own" on public.profiles using (id = (select auth.uid()));
alter policy "profiles_insert_own" on public.profiles with check (id = (select auth.uid()));
alter policy "profiles_update_own" on public.profiles using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy "profiles_delete_own" on public.profiles using (id = (select auth.uid()));

alter policy "orders_select_own" on public.orders using (user_id = (select auth.uid()));
alter policy "orders_insert_own" on public.orders with check (user_id = (select auth.uid()));
alter policy "orders_update_own" on public.orders using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "orders_delete_own" on public.orders using (user_id = (select auth.uid()));

drop index if exists public.referral_credits_phone_used_idx1;
