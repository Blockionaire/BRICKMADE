-- Dedicated BrickMade project recommended. All application objects are prefixed;
-- this migration never drops or rewrites another application's objects.
begin;
create table public.bm_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Your new build' check (length(title) between 1 and 60),
  category text not null check (category in ('house','car','animal','flower','free')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create table public.bm_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  project_id uuid not null,
  bucket text not null check (bucket in ('bm-inputs','bm-designs')),
  path text not null unique,
  mime text not null check (mime in ('image/jpeg','application/json')),
  bytes integer not null check (bytes between 1 and 15000000),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  state text not null default 'reserved' check (state in ('reserved','ready','published','deleted')),
  expires_at timestamptz default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  foreign key (project_id,owner_id) references public.bm_projects(id,owner_id) on delete cascade,
  check (split_part(path,'/',1) = owner_id::text),
  unique (id,owner_id)
);
create table public.bm_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  owner_id uuid not null,
  request_key uuid not null,
  options jsonb not null,
  input_ids uuid[] not null default '{}',
  stage text not null default 'queued' check (stage in ('queued','preparing','interpreting','planning','compiling','checking','finalizing','completed','failed','cancelled')),
  progress integer not null default 0 check (progress between 0 and 100),
  attempt integer not null default 0 check (attempt between 0 and 3),
  cancel_requested boolean not null default false,
  checkpoint jsonb not null default '{}',
  lease_token uuid,
  lease_until timestamptz,
  claimed_by text,
  error jsonb,
  artifact jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id,owner_id) references public.bm_projects(id,owner_id) on delete cascade,
  unique(owner_id,request_key),
  unique(id,owner_id)
);
create index bm_jobs_queue on public.bm_jobs(stage,lease_until,created_at);
create index bm_jobs_owner on public.bm_jobs(owner_id,created_at desc);
create table public.bm_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null,
  owner_id uuid not null,
  stage text not null,
  code text,
  created_at timestamptz not null default now(),
  foreign key (job_id,owner_id) references public.bm_jobs(id,owner_id) on delete cascade
);
create table public.bm_progress (
  project_id uuid not null,
  owner_id uuid not null,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  completed_ids jsonb not null default '[]' check (jsonb_typeof(completed_ids)='array' and jsonb_array_length(completed_ids)<=5000),
  pace text not null default 'medium' check (pace in ('easy','medium','hard')),
  version integer not null default 1,
  primary key (project_id,artifact_sha256),
  updated_at timestamptz not null default now(),
  foreign key (project_id,owner_id) references public.bm_projects(id,owner_id) on delete cascade
);

alter table public.bm_projects enable row level security;
alter table public.bm_assets enable row level security;
alter table public.bm_jobs enable row level security;
alter table public.bm_job_events enable row level security;
alter table public.bm_progress enable row level security;
create policy bm_projects_read on public.bm_projects for select to authenticated using ((select auth.uid())=owner_id);
create policy bm_assets_read on public.bm_assets for select to authenticated using ((select auth.uid())=owner_id);
create policy bm_jobs_read on public.bm_jobs for select to authenticated using ((select auth.uid())=owner_id);
create policy bm_events_read on public.bm_job_events for select to authenticated using ((select auth.uid())=owner_id);
create policy bm_progress_read on public.bm_progress for select to authenticated using ((select auth.uid())=owner_id);
-- Mutations go through the authenticated app API and service-only RPCs.
revoke all on public.bm_projects,public.bm_assets,public.bm_jobs,public.bm_job_events,public.bm_progress from anon,authenticated;
grant select on public.bm_projects,public.bm_assets,public.bm_jobs,public.bm_job_events,public.bm_progress to authenticated;
grant all on public.bm_projects,public.bm_assets,public.bm_jobs,public.bm_job_events,public.bm_progress to service_role;
grant usage,select on sequence public.bm_job_events_id_seq to service_role;

create function public.bm_valid_options(v jsonb) returns boolean language sql immutable set search_path=public,pg_temp as $$
 select jsonb_typeof(v)='object' and (select count(*) from jsonb_object_keys(v))=5
 and v->>'version'='1' and v->>'category'='house'
 and v->>'detail' in ('easy','normal','hard') and v->>'size' in ('compact','standard','large')
 and v->>'pace' in ('easy','medium','hard');
$$;
create function public.bm_create_project(p_owner uuid,p_category text,p_inputs jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.bm_projects; a public.bm_assets; item jsonb; result jsonb:='[]'; asset_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 if p_category<>'house' or jsonb_typeof(p_inputs)<>'array' or jsonb_array_length(p_inputs) not between 1 and 3 then raise exception 'invalid-inputs'; end if;
 if (select count(*) from public.bm_projects where owner_id=p_owner and created_at>now()-interval '24 hours')>=20 then raise exception 'daily-limit'; end if;
 insert into public.bm_projects(owner_id,category) values(p_owner,p_category) returning * into p;
 for item in select value from jsonb_array_elements(p_inputs) loop
   if (item->>'bytes')::integer not between 1 and 716800 or item->>'sha256' !~ '^[a-f0-9]{64}$' then raise exception 'invalid-inputs'; end if;
   asset_id:=gen_random_uuid();
   insert into public.bm_assets(id,owner_id,project_id,bucket,path,mime,bytes,sha256)
   values(asset_id,p_owner,p.id,'bm-inputs',p_owner::text||'/'||p.id::text||'/'||asset_id::text||'.jpg','image/jpeg',(item->>'bytes')::integer,item->>'sha256') returning * into a;
   result:=result||jsonb_build_array(to_jsonb(a));
 end loop;
 return jsonb_build_object('project',to_jsonb(p),'assets',result);
end $$;
create function public.bm_submit_job(p_owner uuid,p_project uuid,p_inputs uuid[],p_options jsonb,p_request uuid,p_parent uuid default null)
returns public.bm_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.bm_jobs; parent public.bm_jobs; valid_inputs integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into j from public.bm_jobs where owner_id=p_owner and request_key=p_request;
 if found then return j; end if;
 if not coalesce(public.bm_valid_options(p_options),false) then raise exception 'invalid-options'; end if;
 if not exists(select 1 from public.bm_projects where id=p_project and owner_id=p_owner) then raise exception 'not-found'; end if;
 perform pg_advisory_xact_lock(hashtextextended('brickmade-daily-budget',0));
 if (select count(*) from public.bm_jobs where created_at>now()-interval '24 hours')>=50 then raise exception 'daily-limit'; end if;
 if (select count(*) from public.bm_jobs where owner_id=p_owner and created_at>now()-interval '24 hours')>=10 then raise exception 'daily-limit'; end if;
 if (select count(*) from public.bm_jobs where owner_id=p_owner and stage not in ('completed','failed','cancelled'))>=2 then raise exception 'active-limit'; end if;
 if p_parent is not null then
   select * into parent from public.bm_jobs where id=p_parent and owner_id=p_owner and project_id=p_project and stage in ('completed','failed');
   if not found or not (parent.checkpoint ? 'description') then raise exception 'invalid-parent'; end if;
   p_inputs := '{}';
 else
   if cardinality(p_inputs) not between 1 and 3 or cardinality(p_inputs)<>(select count(distinct x) from unnest(p_inputs) x) then raise exception 'invalid-inputs'; end if;
   select count(*) into valid_inputs from public.bm_assets where id=any(p_inputs) and owner_id=p_owner and project_id=p_project and bucket='bm-inputs' and state<>'deleted' and expires_at>now();
   if valid_inputs<>cardinality(p_inputs) then raise exception 'invalid-inputs'; end if;
 end if;
 insert into public.bm_jobs(owner_id,project_id,request_key,options,input_ids,checkpoint)
 values(p_owner,p_project,p_request,p_options,p_inputs,case when p_parent is not null then jsonb_build_object('description',parent.checkpoint->'description','parent',p_parent) else '{}'::jsonb end) returning * into j;
 insert into public.bm_job_events(job_id,owner_id,stage) values(j.id,j.owner_id,'queued');
 return j;
end $$;

create function public.bm_claim_job(p_worker text,p_seconds integer default 180) returns public.bm_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.bm_jobs;
begin
 perform pg_advisory_xact_lock(hashtextextended('brickmade-worker-claim',0));
 update public.bm_jobs set stage='cancelled',lease_token=null,lease_until=null,updated_at=now()
 where cancel_requested and stage not in ('completed','failed','cancelled') and (lease_until is null or lease_until<now());
 update public.bm_jobs set stage='failed',error=jsonb_build_object('code','worker-exhausted','message','Generation was interrupted repeatedly. Please start a new build.','stage',stage,'requestId',id),lease_token=null,lease_until=null,updated_at=now()
 where stage not in ('completed','failed','cancelled') and lease_until<now() and attempt>=3;
 if (select count(*) from public.bm_jobs where lease_until>now() and stage not in ('completed','failed','cancelled'))>=4 then return null; end if;
 select * into j from public.bm_jobs q where not q.cancel_requested and q.attempt<3
 and (q.stage='queued' or (q.stage not in ('completed','failed','cancelled') and q.lease_until<now()))
 and not exists(select 1 from public.bm_jobs a where a.owner_id=q.owner_id and a.lease_until>now() and a.stage not in ('completed','failed','cancelled'))
 order by q.created_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.bm_jobs set stage='preparing',progress=5,attempt=attempt+1,lease_token=gen_random_uuid(),lease_until=now()+make_interval(secs=>greatest(30,least(300,p_seconds))),claimed_by=left(p_worker,100),updated_at=now()
 where id=j.id returning * into j;
 insert into public.bm_job_events(job_id,owner_id,stage) values(j.id,j.owner_id,'preparing');
 return j;
end $$;

create function public.bm_heartbeat(p_job uuid,p_lease uuid,p_seconds integer default 180) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.bm_jobs set lease_until=now()+make_interval(secs=>greatest(30,least(300,p_seconds)))
 where id=p_job and lease_token=p_lease and lease_until>now() and not cancel_requested and stage not in ('completed','failed','cancelled');
 return found;
end $$;
create function public.bm_job_step(p_job uuid,p_lease uuid,p_stage text,p_progress integer,p_checkpoint jsonb default '{}') returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.bm_jobs;
begin
 if p_stage not in ('preparing','interpreting','planning','compiling','checking','finalizing') or p_progress not between 5 and 99 or jsonb_typeof(p_checkpoint)<>'object' then raise exception 'invalid-stage'; end if;
 update public.bm_jobs set stage=p_stage,progress=p_progress,checkpoint=checkpoint||p_checkpoint,updated_at=now()
 where id=p_job and lease_token=p_lease and lease_until>now() and not cancel_requested and stage not in ('completed','failed','cancelled') returning * into j;
 if not found then return false; end if;
 insert into public.bm_job_events(job_id,owner_id,stage) values(j.id,j.owner_id,p_stage);
 return true;
end $$;
create function public.bm_finish_job(p_job uuid,p_lease uuid,p_artifact jsonb,p_title text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.bm_jobs;
begin
 if length(p_title) not between 1 and 60 or p_artifact->>'sha256' !~ '^[a-f0-9]{64}$' or (p_artifact->>'bytes')::integer not between 1 and 15000000 or coalesce((p_artifact->>'pieceCount')::integer,0) not between 1 and 5000 then raise exception 'invalid-artifact'; end if;
 update public.bm_jobs set stage='completed',progress=100,artifact=p_artifact,lease_until=null,lease_token=null,updated_at=now()
 where id=p_job and lease_token=p_lease and lease_until>now() and not cancel_requested and stage='finalizing' returning * into j;
 if not found then return false; end if;
 if p_artifact->>'path' <> j.owner_id::text||'/'||j.project_id::text||'/'||j.id::text||'/'||p_lease::text||'.json' then raise exception 'artifact-fence'; end if;
 if not exists(select 1 from public.bm_assets where path=p_artifact->>'path' and owner_id=j.owner_id and project_id=j.project_id and bucket='bm-designs' and sha256=p_artifact->>'sha256') then raise exception 'missing-artifact'; end if;
 update public.bm_assets set state='published',expires_at=null where path=p_artifact->>'path';
 update public.bm_projects set title=p_title,updated_at=now() where id=j.project_id;
 insert into public.bm_job_events(job_id,owner_id,stage) values(j.id,j.owner_id,'completed');
 return true;
end $$;
create function public.bm_fail_job(p_job uuid,p_lease uuid,p_code text,p_message text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.bm_jobs;
begin
 update public.bm_jobs set stage=case when cancel_requested or p_code='cancelled' then 'cancelled' else 'failed' end,
 error=case when cancel_requested or p_code='cancelled' then null else jsonb_build_object('code',left(p_code,80),'message',left(p_message,400),'stage',stage,'requestId',id) end,
 lease_token=null,lease_until=null,updated_at=now()
 where id=p_job and lease_token=p_lease and lease_until>now() and stage not in ('completed','failed','cancelled') returning * into j;
 if not found then return false; end if;
 insert into public.bm_job_events(job_id,owner_id,stage,code) values(j.id,j.owner_id,j.stage,left(p_code,80));
 return true;
end $$;
create function public.bm_release_job(p_job uuid,p_lease uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.bm_jobs set stage=case when cancel_requested then 'cancelled' else 'queued' end,lease_token=null,lease_until=null,updated_at=now()
 where id=p_job and lease_token=p_lease and lease_until>now() and stage not in ('completed','failed','cancelled');
 return found;
end $$;
create function public.bm_cancel_job(p_owner uuid,p_job uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.bm_jobs set cancel_requested=true,stage=case when stage='queued' then 'cancelled' else stage end,updated_at=now()
 where id=p_job and owner_id=p_owner and stage not in ('completed','failed','cancelled');
 return found;
end $$;
create function public.bm_save_progress(p_owner uuid,p_project uuid,p_sha text,p_ids jsonb,p_pace text,p_version integer)
returns public.bm_progress language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.bm_progress; piece_count integer;
begin
 if p_pace not in ('easy','medium','hard') or jsonb_typeof(p_ids)<>'array' or jsonb_array_length(p_ids)>5000 then raise exception 'invalid-progress'; end if;
 select (artifact->>'pieceCount')::integer into piece_count from public.bm_jobs where owner_id=p_owner and project_id=p_project and stage='completed' and artifact->>'sha256'=p_sha limit 1;
 if not found then raise exception 'not-found'; end if;
 if piece_count is null or (select count(distinct value) from jsonb_array_elements(p_ids))<>jsonb_array_length(p_ids) then raise exception 'invalid-progress'; end if;
 if exists(select 1 from jsonb_array_elements(p_ids) x where jsonb_typeof(x)<>'string' or x#>>'{}' !~ '^piece-[1-9][0-9]{0,3}$') then raise exception 'invalid-progress'; end if;
 if exists(select 1 from jsonb_array_elements_text(p_ids) x where substring(x from 7)::integer>piece_count) then raise exception 'invalid-progress'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_project::text,1));
 select * into r from public.bm_progress where project_id=p_project and artifact_sha256=p_sha;
 if found and r.version<>p_version then raise exception 'progress-conflict'; end if;
 if not found and p_version<>0 then raise exception 'progress-conflict'; end if;
 insert into public.bm_progress(project_id,owner_id,artifact_sha256,completed_ids,pace,version)
 values(p_project,p_owner,p_sha,p_ids,p_pace,p_version+1)
 on conflict(project_id,artifact_sha256) do update set completed_ids=excluded.completed_ids,pace=excluded.pace,version=excluded.version,updated_at=now()
 returning * into r;
 return r;
end $$;

revoke all on function public.bm_valid_options(jsonb),public.bm_create_project(uuid,text,jsonb),public.bm_submit_job(uuid,uuid,uuid[],jsonb,uuid,uuid),public.bm_claim_job(text,integer),public.bm_heartbeat(uuid,uuid,integer),public.bm_job_step(uuid,uuid,text,integer,jsonb),public.bm_finish_job(uuid,uuid,jsonb,text),public.bm_fail_job(uuid,uuid,text,text),public.bm_release_job(uuid,uuid),public.bm_cancel_job(uuid,uuid),public.bm_save_progress(uuid,uuid,text,jsonb,text,integer) from public,anon,authenticated;
grant execute on function public.bm_valid_options(jsonb),public.bm_create_project(uuid,text,jsonb),public.bm_submit_job(uuid,uuid,uuid[],jsonb,uuid,uuid),public.bm_claim_job(text,integer),public.bm_heartbeat(uuid,uuid,integer),public.bm_job_step(uuid,uuid,text,integer,jsonb),public.bm_finish_job(uuid,uuid,jsonb,text),public.bm_fail_job(uuid,uuid,text,text),public.bm_release_job(uuid,uuid),public.bm_cancel_job(uuid,uuid),public.bm_save_progress(uuid,uuid,text,jsonb,text,integer) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('bm-inputs','bm-inputs',false,716800,array['image/jpeg']),
 ('bm-designs','bm-designs',false,15000000,array['application/json']);
create policy bm_input_owner_read on storage.objects for select to authenticated using(bucket_id='bm-inputs' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.bm_assets a where a.path=name and a.bucket='bm-inputs' and a.expires_at>now() and a.state<>'deleted'));
create policy bm_design_owner_read on storage.objects for select to authenticated using(bucket_id='bm-designs' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
