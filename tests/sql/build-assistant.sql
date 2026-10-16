\set ON_ERROR_STOP on
begin;
do $$declare owner uuid:='11111111-1111-4111-8111-111111111111'; other_owner uuid:='22222222-2222-4222-8222-222222222222'; p uuid; j uuid; key uuid:=gen_random_uuid(); reserved jsonb; cached jsonb; answer jsonb:='{"answer":"Fixture","pieceIds":[],"stepNumbers":[1],"action":"none"}';
begin
 insert into brickmade.bm_projects(owner_id,category) values(owner,'house') returning id into p;
 insert into brickmade.bm_jobs(owner_id,project_id,request_key,options,input_ids,stage,artifact) values(owner,p,gen_random_uuid(),'{"version":1,"category":"house","detail":"normal","size":"compact","pace":"medium"}','{}','completed','{"sha256":"fixture"}') returning id into j;
 begin perform brickmade.bm_assistant_begin(other_owner,j,key,repeat('a',64));raise exception 'Other owner accessed AI context';exception when others then if sqlerrm<>'not-found' then raise;end if;end;
 reserved:=brickmade.bm_assistant_begin(owner,j,key,repeat('a',64));
 if (reserved->>'cached')::boolean then raise exception 'First call cached';end if;
 begin perform brickmade.bm_assistant_begin(owner,j,key,repeat('a',64));raise exception 'Uncertain call retried';exception when others then if sqlerrm<>'assistant-request-uncertain' then raise;end if;end;
 begin perform brickmade.bm_assistant_begin(owner,j,key,repeat('b',64));raise exception 'Changed request reused';exception when others then if sqlerrm<>'assistant-request-conflict' then raise;end if;end;
 if brickmade.bm_assistant_finish(other_owner,(reserved->>'id')::uuid,answer) then raise exception 'Other owner completed call';end if;
 if not brickmade.bm_assistant_finish(owner,(reserved->>'id')::uuid,answer) then raise exception 'Could not finish AI call';end if;
 if brickmade.bm_assistant_finish(owner,(reserved->>'id')::uuid,answer) then raise exception 'Duplicate finish accepted';end if;
 cached:=brickmade.bm_assistant_begin(owner,j,key,repeat('a',64));
 if not (cached->>'cached')::boolean or cached->'response'<>answer then raise exception 'Cached answer lost';end if;
 reserved:=brickmade.bm_assistant_begin(owner,j,gen_random_uuid(),repeat('c',64));
 perform brickmade.bm_assistant_finish(owner,(reserved->>'id')::uuid,null,'assistant-interrupted');
 -- Two simultaneous calls are allowed per owner, a third is refused.
 perform brickmade.bm_assistant_begin(owner,j,gen_random_uuid(),repeat('d',64));
 perform brickmade.bm_assistant_begin(owner,j,gen_random_uuid(),repeat('e',64));
 begin perform brickmade.bm_assistant_begin(owner,j,gen_random_uuid(),repeat('f',64));raise exception 'Concurrency budget bypassed';exception when others then if sqlerrm<>'assistant-busy' then raise;end if;end;
 update brickmade.bm_assistant_calls set status='failed';
 insert into brickmade.bm_assistant_calls(owner_id,job_id,request_key,fingerprint,status) select owner,j,gen_random_uuid(),repeat('f',64),'failed' from generate_series(1,50-(select count(*)::integer from brickmade.bm_assistant_calls));
 begin perform brickmade.bm_assistant_begin(owner,j,gen_random_uuid(),repeat('f',64));raise exception 'Daily quota bypassed';exception when others then if sqlerrm<>'assistant-daily-limit' then raise;end if;end;
 update brickmade.bm_assistant_calls set created_at=now()-interval '25 hours',response=answer;
 perform brickmade.bm_assistant_cleanup();
 if exists(select 1 from brickmade.bm_assistant_calls where response is not null) then raise exception 'Expired answer retained';end if;
 update brickmade.bm_assistant_calls set created_at=now()-interval '8 days';
 perform brickmade.bm_assistant_cleanup();
 if exists(select 1 from brickmade.bm_assistant_calls) then raise exception 'Expired call metadata retained';end if;
end $$;
set local role authenticated;
do $$begin
 begin perform 1 from brickmade.bm_assistant_calls;raise exception 'Private AI call rows exposed';exception when insufficient_privilege then null;end;
 begin perform brickmade.bm_assistant_begin('11111111-1111-4111-8111-111111111111',gen_random_uuid(),gen_random_uuid(),repeat('a',64));raise exception 'Client AI RPC allowed';exception when insufficient_privilege then null;end;
end $$;
rollback;
