\set ON_ERROR_STOP on
begin;
do $$
declare created jsonb; other jsonb; project uuid; photo uuid; j public.bm_jobs; claimed public.bm_jobs; lease uuid; published_path text; cancelled public.bm_jobs; failed boolean; valid_options jsonb:='{"version":1,"category":"house","detail":"normal","size":"compact","pace":"medium"}';
begin
 created:=public.bm_create_project('11111111-1111-4111-8111-111111111111','house','[{"bytes":100,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]');
 project:=(created->'project'->>'id')::uuid;photo:=(created->'assets'->0->>'id')::uuid;
 other:=public.bm_create_project('22222222-2222-4222-8222-222222222222','house','[{"bytes":100,"sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]');
 begin perform public.bm_submit_job('22222222-2222-4222-8222-222222222222',project,array[photo],valid_options,gen_random_uuid());raise exception 'owner isolation failed';exception when others then if sqlerrm<>'not-found' then raise; end if; end;
 j:=public.bm_submit_job('11111111-1111-4111-8111-111111111111',project,array[photo],valid_options,'33333333-3333-4333-8333-333333333333');
 if (public.bm_submit_job(j.owner_id,project,array[photo],valid_options,j.request_key)).id<>j.id then raise exception 'idempotency failed'; end if;
 claimed:=public.bm_claim_job('sql-worker',180);lease:=claimed.lease_token;
 if claimed.id<>j.id or claimed.attempt<>1 then raise exception 'claim failed'; end if;
 if public.bm_job_step(j.id,gen_random_uuid(),'checking',60,'{}') then raise exception 'stale worker updated job';end if;
 if not public.bm_job_step(j.id,lease,'planning',40,'{"description":{"version":2}}') then raise exception 'checkpoint failed';end if;
 update public.bm_jobs set lease_until=now()-interval '1 second' where id=j.id;
 claimed:=public.bm_claim_job('replacement-worker',180);
 if claimed.id<>j.id or claimed.attempt<>2 or claimed.lease_token=lease then raise exception 'lease recovery failed';end if;
 if public.bm_heartbeat(j.id,lease,180) then raise exception 'stale heartbeat succeeded';end if;
 if not(claimed.checkpoint?'description') then raise exception 'checkpoint lost on recovery';end if;
 lease:=claimed.lease_token;
 if not public.bm_job_step(j.id,lease,'finalizing',94,'{}') then raise exception 'finalizing failed';end if;
 published_path:=j.owner_id::text||'/'||project::text||'/'||j.id::text||'/'||lease::text||'.json';
 insert into public.bm_assets(owner_id,project_id,bucket,path,mime,bytes,sha256) values(j.owner_id,project,'bm-designs',published_path,'application/json',100,repeat('c',64));
 if not public.bm_finish_job(j.id,lease,jsonb_build_object('path',published_path,'sha256',repeat('c',64),'bytes',100,'pieceCount',20),'A checked house') then raise exception 'publication failed';end if;
 if public.bm_finish_job(j.id,lease,jsonb_build_object('path',published_path,'sha256',repeat('c',64),'bytes',100,'pieceCount',20),'Again') then raise exception 'duplicate publication succeeded';end if;
 if exists(select 1 from public.bm_assets where path=published_path and expires_at is not null) then raise exception 'published artifact will expire';end if;
 perform public.bm_save_progress(j.owner_id,project,repeat('c',64),'["piece-1"]','easy',0);
 begin perform public.bm_save_progress(j.owner_id,project,repeat('c',64),'[]','medium',0);raise exception 'lost update accepted';exception when others then if sqlerrm<>'progress-conflict' then raise;end if;end;
 begin perform public.bm_save_progress(j.owner_id,project,repeat('c',64),'["piece-21"]','easy',1);raise exception 'nonexistent piece accepted';exception when others then if sqlerrm<>'invalid-progress' then raise;end if;end;
 begin perform public.bm_save_progress(j.owner_id,project,repeat('c',64),'["piece-1","piece-1"]','easy',1);raise exception 'duplicate piece accepted';exception when others then if sqlerrm<>'invalid-progress' then raise;end if;end;
 cancelled:=public.bm_submit_job(j.owner_id,project,array[photo],valid_options,gen_random_uuid());
 perform public.bm_cancel_job(j.owner_id,cancelled.id);
 if (select stage from public.bm_jobs where id=cancelled.id)<>'cancelled' then raise exception 'queued cancellation failed';end if;
 if exists(select 1 from public.bm_jobs where owner_id='22222222-2222-4222-8222-222222222222') then raise exception 'unexpected cross-owner job';end if;
 raise notice 'PASS: ownership, idempotency, checkpoint recovery, fencing, publication, progress concurrency and cancellation';
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$begin
 if (select count(*) from public.bm_projects)<>1 then raise exception 'RLS project isolation failed';end if;
 if exists(select 1 from public.bm_jobs) then raise exception 'RLS job isolation failed';end if;
 begin perform public.bm_claim_job('untrusted',180);raise exception 'untrusted worker RPC allowed';exception when insufficient_privilege then null;end;
 begin insert into public.bm_projects(owner_id,category) values(auth.uid(),'house');raise exception 'untrusted table write allowed';exception when insufficient_privilege then null;end;
 raise notice 'PASS: authenticated read isolation and denied direct writes/service-only RPCs';
end $$;
rollback;
