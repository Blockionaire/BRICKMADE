-- MANUAL TEMPLATE, NOT A BRICKMADE MIGRATION.
-- Use only after confirming the existing app sends Supabase user sessions.
-- Replace schema/table and add only the approved app users' auth.users UUIDs.
-- Do not select every account in a shared Supabase project automatically.
-- Empty, unknown or guest account lists fail before changing any access rule.
begin;
do $$
declare
 target_schema text := 'public';
 target_table text := 'ovs_state';
 approved_user_ids uuid[] := array[]::uuid[];
 target_id oid;
begin
 if target_schema='REPLACE_SCHEMA' or target_table='REPLACE_TABLE' then
  raise exception 'Set the existing app schema and table first';
 end if;
 if coalesce(cardinality(approved_user_ids),0)=0 then
  raise exception 'Add the explicitly approved app users UUIDs first';
 end if;
 if exists (
  select 1 from unnest(approved_user_ids) selected(id)
  left join auth.users u on u.id=selected.id
  where u.id is null or coalesce(u.is_anonymous,false)
 ) then
  raise exception 'Approved accounts must exist and use non-guest Supabase sign-in';
 end if;
 target_id:=to_regclass(format('%I.%I',target_schema,target_table));
 if target_id is null or not exists(select 1 from pg_class where oid=target_id and relkind in ('r','p')) then
  raise exception 'The selected app table does not exist';
 end if;
 if exists(select 1 from pg_policy where polrelid=target_id and polname='approved_group_access_guard') then
  raise exception 'An approved-group guard already exists; review its membership before updating it';
 end if;

 -- Retain existing grants and sharing policies, adding a mandatory membership
 -- condition that permissive policies cannot bypass. Other tables are untouched.
 execute format('alter table %I.%I enable row level security',target_schema,target_table);
 execute format(
  'create policy approved_group_access_guard on %I.%I as restrictive for all to public using ((select auth.uid())=any(%L::uuid[])) with check ((select auth.uid())=any(%L::uuid[]))',
  target_schema,target_table,approved_user_ids::text,approved_user_ids::text
 );
end $$;
-- The UI fails closed until this checked entry point is installed with the guard.
create function public.ovs_can_access() returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from pg_catalog.pg_policy
  where polrelid='public.ovs_state'::regclass
   and polname='approved_group_access_guard' and not polpermissive)
 and exists(select 1 from public.ovs_state where id='main')
$$;
revoke all on function public.ovs_can_access() from public,anon;
grant execute on function public.ovs_can_access() to authenticated;
notify pgrst, 'reload schema';
commit;
