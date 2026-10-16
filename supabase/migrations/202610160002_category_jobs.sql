-- Extend only BrickMade RPCs. Existing House projects and job leases are preserved.
begin;
create or replace function brickmade.bm_valid_options(v jsonb) returns boolean language sql immutable set search_path=brickmade,pg_temp as $$
 select jsonb_typeof(v)='object' and (select count(*) from jsonb_object_keys(v))=5
 and v->'version'='1'::jsonb and v->>'category' in ('house','flower','car','animal','free')
 and v->>'detail' in ('easy','normal','hard') and v->>'size' in ('compact','standard','large')
 and v->>'pace' in ('easy','medium','hard');
$$;
create or replace function brickmade.bm_create_project(p_owner uuid,p_category text,p_inputs jsonb) returns jsonb
language plpgsql security definer set search_path=brickmade,pg_temp as $$
declare p brickmade.bm_projects; a brickmade.bm_assets; item jsonb; result jsonb:='[]'; asset_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 if p_category not in ('house','flower','car','animal','free') or jsonb_typeof(p_inputs)<>'array' or jsonb_array_length(p_inputs) not between 1 and 3 then raise exception 'invalid-inputs'; end if;
 if (select count(*) from brickmade.bm_projects where owner_id=p_owner and created_at>now()-interval '24 hours')>=20 then raise exception 'daily-limit'; end if;
 insert into brickmade.bm_projects(owner_id,category) values(p_owner,p_category) returning * into p;
 for item in select value from jsonb_array_elements(p_inputs) loop
   if (item->>'bytes')::integer not between 1 and 716800 or item->>'sha256' !~ '^[a-f0-9]{64}$' then raise exception 'invalid-inputs'; end if;
   asset_id:=gen_random_uuid();
   insert into brickmade.bm_assets(id,owner_id,project_id,bucket,path,mime,bytes,sha256)
   values(asset_id,p_owner,p.id,'bm-inputs',p_owner::text||'/'||p.id::text||'/'||asset_id::text||'.jpg','image/jpeg',(item->>'bytes')::integer,item->>'sha256') returning * into a;
   result:=result||jsonb_build_array(to_jsonb(a));
 end loop;
 return jsonb_build_object('project',to_jsonb(p),'assets',result);
end $$;
create or replace function brickmade.bm_submit_job(p_owner uuid,p_project uuid,p_inputs uuid[],p_options jsonb,p_request uuid,p_parent uuid default null)
returns brickmade.bm_jobs language plpgsql security definer set search_path=brickmade,pg_temp as $$
declare j brickmade.bm_jobs; parent brickmade.bm_jobs; valid_inputs integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into j from brickmade.bm_jobs where owner_id=p_owner and request_key=p_request;
 if found then return j; end if;
 if not coalesce(brickmade.bm_valid_options(p_options),false) then raise exception 'invalid-options'; end if;
 if not exists(select 1 from brickmade.bm_projects where id=p_project and owner_id=p_owner and category=p_options->>'category') then raise exception 'not-found'; end if;
 perform pg_advisory_xact_lock(hashtextextended('brickmade-daily-budget',0));
 if (select count(*) from brickmade.bm_jobs where created_at>now()-interval '24 hours')>=50 then raise exception 'daily-limit'; end if;
 if (select count(*) from brickmade.bm_jobs where owner_id=p_owner and created_at>now()-interval '24 hours')>=10 then raise exception 'daily-limit'; end if;
 if (select count(*) from brickmade.bm_jobs where owner_id=p_owner and stage not in ('completed','failed','cancelled'))>=2 then raise exception 'active-limit'; end if;
 if p_parent is not null then
   select * into parent from brickmade.bm_jobs where id=p_parent and owner_id=p_owner and project_id=p_project and stage in ('completed','failed');
   if not found or not (parent.checkpoint ? 'description') then raise exception 'invalid-parent'; end if;
   p_inputs := '{}';
 else
   if cardinality(p_inputs) not between 1 and 3 or cardinality(p_inputs)<>(select count(distinct x) from unnest(p_inputs) x) then raise exception 'invalid-inputs'; end if;
   select count(*) into valid_inputs from brickmade.bm_assets where id=any(p_inputs) and owner_id=p_owner and project_id=p_project and bucket='bm-inputs' and state<>'deleted' and expires_at>now();
   if valid_inputs<>cardinality(p_inputs) then raise exception 'invalid-inputs'; end if;
 end if;
 insert into brickmade.bm_jobs(owner_id,project_id,request_key,options,input_ids,checkpoint)
 values(p_owner,p_project,p_request,p_options,p_inputs,case when p_parent is not null then jsonb_build_object('description',parent.checkpoint->'description','providerModel',parent.checkpoint->'providerModel','moduleVersion',parent.checkpoint->'moduleVersion','inputHashes',parent.checkpoint->'inputHashes','parent',p_parent) else '{}'::jsonb end) returning * into j;
 insert into brickmade.bm_job_events(job_id,owner_id,stage) values(j.id,j.owner_id,'queued');
 return j;
end $$;
create or replace function brickmade.bm_claim_job(p_worker text,p_seconds integer default 180) returns brickmade.bm_jobs
language plpgsql security definer set search_path=brickmade,pg_temp as $$
declare j brickmade.bm_jobs;
begin
 perform pg_advisory_xact_lock(hashtextextended('brickmade-worker-claim',0));
 update brickmade.bm_jobs set stage='cancelled',lease_token=null,lease_until=null,updated_at=now()
 where cancel_requested and stage not in ('completed','failed','cancelled') and (lease_until is null or lease_until<now());
 update brickmade.bm_jobs set stage='failed',error=jsonb_build_object('code','worker-exhausted','message','Generation was interrupted repeatedly. Please start a new build.','stage',stage,'requestId',id),lease_token=null,lease_until=null,updated_at=now()
 where stage not in ('completed','failed','cancelled') and lease_until<now() and attempt>=3;
 if (select count(*) from brickmade.bm_jobs where lease_until>now() and stage not in ('completed','failed','cancelled'))>=4 then return null; end if;
 select * into j from brickmade.bm_jobs q where not q.cancel_requested and q.attempt<3
 and (q.stage='queued' or (q.stage not in ('completed','failed','cancelled') and q.lease_until<now()))
 and (q.options->>'category'='house' or exists(select 1 from brickmade.bm_workers w where w.id=p_worker and w.seen_at>now()-interval '60 seconds' and w.state<>'stopped' and w.vision_configured and q.options->>'category'=any(w.categories)))
 and not exists(select 1 from brickmade.bm_jobs a where a.owner_id=q.owner_id and a.lease_until>now() and a.stage not in ('completed','failed','cancelled'))
 order by q.created_at for update skip locked limit 1;
 if not found then return null; end if;
 update brickmade.bm_jobs set stage='preparing',progress=5,attempt=attempt+1,lease_token=gen_random_uuid(),lease_until=now()+make_interval(secs=>greatest(30,least(300,p_seconds))),claimed_by=left(p_worker,100),updated_at=now()
 where id=j.id returning * into j;
 insert into brickmade.bm_job_events(job_id,owner_id,stage) values(j.id,j.owner_id,'preparing');
 return j;
end $$;
notify pgrst,'reload schema';
commit;
