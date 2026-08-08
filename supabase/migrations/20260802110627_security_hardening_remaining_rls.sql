alter policy "notifications_select_own" on public.notifications using (user_id = (select auth.uid()));
alter policy "notifications_insert_own" on public.notifications with check (user_id = (select auth.uid()));
alter policy "notifications_update_own" on public.notifications using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "notifications_delete_own" on public.notifications using (user_id = (select auth.uid()));

alter policy "payments_select_own" on public.payments using (user_id = (select auth.uid()));
alter policy "payments_insert_own" on public.payments with check (user_id = (select auth.uid()));
alter policy "payments_update_own" on public.payments using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "payments_delete_own" on public.payments using (user_id = (select auth.uid()));

alter policy "agent_applications_select_own" on public.agent_applications using (user_id = (select auth.uid()));
alter policy "agent_applications_insert_own" on public.agent_applications with check (user_id = (select auth.uid()));
alter policy "agent_applications_update_own" on public.agent_applications using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "agent_applications_delete_own" on public.agent_applications using (user_id = (select auth.uid()));
