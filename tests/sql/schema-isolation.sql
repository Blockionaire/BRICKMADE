\set ON_ERROR_STOP on
do $$
declare object_name text; f record;
begin
 foreach object_name in array array['bm_projects','bm_assets','bm_jobs','bm_job_events','bm_progress'] loop
  if to_regclass('public.'||object_name) is not null or to_regclass('brickmade.'||object_name) is null then raise exception 'Table did not move: %',object_name;end if;
 end loop;
 if (select title from brickmade.bm_projects where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>'Preserve this existing BrickMade build' then raise exception 'Existing build changed';end if;
 if (select label from public.shared_app_fixture where id=1)<>'Existing app data' then raise exception 'Unrelated app row changed';end if;
 if public.shared_app_fixture_value()<>'existing function' then raise exception 'Unrelated app function changed';end if;
 if not exists(select 1 from storage.buckets where id='other-app-private' and not public and file_size_limit=1000) then raise exception 'Unrelated app bucket changed';end if;
 if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='brickmade' and left(p.proname,3)='bm_')<>11 then raise exception 'Missing scoped RPCs';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and left(p.proname,3)='bm_') then raise exception 'Old RPC remains in public';end if;
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='brickmade' loop
  if not ('search_path=brickmade, pg_temp'=any(f.proconfig)) then raise exception 'Unsafe function path: %',f.proname;end if;
  if position('public.bm_' in pg_get_functiondef(f.oid))>0 then raise exception 'Stale function reference: %',f.proname;end if;
 end loop;
 if has_schema_privilege('anon','brickmade','USAGE') then raise exception 'Unauthenticated schema access';end if;
 if not has_schema_privilege('authenticated','brickmade','USAGE') or not has_schema_privilege('service_role','brickmade','USAGE') then raise exception 'Required schema usage missing';end if;
 if not has_table_privilege('authenticated','brickmade.bm_projects','SELECT') or has_table_privilege('authenticated','brickmade.bm_projects','INSERT') then raise exception 'Table privileges changed';end if;
 if not has_sequence_privilege('service_role','brickmade.bm_job_events_id_seq','USAGE') then raise exception 'Event sequence privileges changed';end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and policyname='bm_input_owner_read' and qual like '%brickmade.bm_assets%') then raise exception 'Storage policy did not follow moved assets';end if;
 raise notice 'PASS: isolated namespace, preserved existing builds, unrelated app data/functions/buckets, retained ACLs and scoped function paths';
end $$;
