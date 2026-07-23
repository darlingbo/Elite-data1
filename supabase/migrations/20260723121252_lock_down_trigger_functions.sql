-- Trigger functions execute automatically and never need direct API access.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_agent_application_user_id() from public, anon, authenticated;

alter function public.handle_new_user() set search_path = public;
alter function public.set_agent_application_user_id() set search_path = public;
