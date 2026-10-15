-- Move only BrickMade's existing objects into its own namespace.
-- Apply after 202610150001_studio.sql. Existing rows, RLS, FKs and grants are retained.
begin;
-- Refuse to reuse an existing namespace; it may belong to another application.
create schema brickmade;
revoke all on schema brickmade from public,anon;
grant usage on schema brickmade to authenticated,service_role;
alter default privileges in schema brickmade revoke execute on functions from public;

alter table public.bm_projects set schema brickmade;
alter table public.bm_assets set schema brickmade;
alter table public.bm_jobs set schema brickmade;
alter table public.bm_job_events set schema brickmade;
alter table public.bm_progress set schema brickmade;

-- Exact signatures prevent moving unrelated functions with similar prefixes.
do $$
declare signature text; function_id oid; definition text; identity_arguments text; function_name text;
begin
 foreach signature in array array[
  'public.bm_valid_options(jsonb)',
  'public.bm_create_project(uuid,text,jsonb)',
  'public.bm_submit_job(uuid,uuid,uuid[],jsonb,uuid,uuid)',
  'public.bm_claim_job(text,integer)',
  'public.bm_heartbeat(uuid,uuid,integer)',
  'public.bm_job_step(uuid,uuid,text,integer,jsonb)',
  'public.bm_finish_job(uuid,uuid,jsonb,text)',
  'public.bm_fail_job(uuid,uuid,text,text)',
  'public.bm_release_job(uuid,uuid)',
  'public.bm_cancel_job(uuid,uuid)',
  'public.bm_save_progress(uuid,uuid,text,jsonb,text,integer)'
 ] loop
  function_id:=to_regprocedure(signature)::oid;
  if function_id is null then raise exception 'Required BrickMade function is missing: %',signature; end if;
  select proname,pg_get_function_identity_arguments(oid) into function_name,identity_arguments from pg_proc where oid=function_id;
  execute format('alter function %s set schema brickmade',function_id::regprocedure);
  definition:=pg_get_functiondef(function_id);
  -- Stored PL/pgSQL source uses explicit table/function qualifiers. Update those
  -- along with the namespace, retaining the function OID and existing privileges.
  execute replace(definition,'public.bm_','brickmade.bm_');
  execute format('alter function brickmade.%I(%s) set search_path=brickmade,pg_temp',function_name,identity_arguments);
 end loop;
end $$;

-- Storage policies reference table OIDs and follow the move automatically.
notify pgrst, 'reload schema';
commit;
