-- READ ONLY: run in the shared project's SQL Editor and review before installation.
-- Returns database structure/policies only, never application rows or credentials.
begin read only;

select current_database() as database_name,
       to_regnamespace('brickmade') is not null as brickmade_schema_exists;

select n.nspname as schema_name,c.relname as object_name,c.relkind as object_kind
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='brickmade' or (n.nspname='public' and left(c.relname,3)='bm_')
order by schema_name,object_name;

select n.nspname as schema_name,p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='brickmade' or (n.nspname='public' and left(p.proname,3)='bm_')
order by schema_name,function_name;

select id as bucket_name,public as publicly_readable
from storage.buckets where id in ('bm-inputs','bm-designs');

-- Anonymous Auth users have role authenticated. Existing broad policies need
-- review before enabling anonymous sign-ins; this report is not an automatic audit.
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies
where schemaname not in ('pg_catalog','information_schema','auth')
  and roles && array['public','authenticated','anon']::name[]
order by schemaname,tablename,policyname;

select n.nspname as schema_name,c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       has_table_privilege('authenticated',c.oid,'SELECT') as signed_in_read_grant
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where c.relkind in ('r','p') and n.nspname='public'
order by table_name;
rollback;
