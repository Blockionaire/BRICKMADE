\set ON_ERROR_STOP on
begin;
do $$declare h jsonb;begin
 if (brickmade.bm_worker_health()->>'online')::integer<>0 then raise exception 'Unexpected initial workers';end if;
 perform brickmade.bm_report_worker('health-fixture','idle',null,'fixture-v1',array['house'],false);
 h:=brickmade.bm_worker_health();
 if (h->>'online')::integer<>1 or (h->>'visionConfigured')::integer<>0 then raise exception 'Missing provider distinction';end if;
 perform brickmade.bm_report_worker('health-fixture','working',null,'fixture-v1',array['house','flower'],true);
 h:=brickmade.bm_worker_health();
 if (h->>'online')::integer<>1 or not(h->'categories'?'flower') then raise exception 'Missing category heartbeat';end if;
 update brickmade.bm_workers set seen_at=now()-interval '2 minutes';
 if (brickmade.bm_worker_health()->>'online')::integer<>0 then raise exception 'Stale worker is online';end if;
 perform brickmade.bm_report_worker('health-fixture','stopped',null,'fixture-v1',array['house'],true);
 if (brickmade.bm_worker_health()->>'online')::integer<>0 then raise exception 'Stopped worker is online';end if;
 begin perform brickmade.bm_report_worker('bad','invalid',null,'fixture',array['house'],true);raise exception 'Bad worker accepted';exception when others then if sqlerrm<>'invalid-worker' then raise;end if;end;
end $$;
set local role authenticated;
do $$begin
 begin perform brickmade.bm_worker_health();raise exception 'Private health RPC exposed';exception when insufficient_privilege then null;end;
 begin perform 1 from brickmade.bm_workers;raise exception 'Private worker rows exposed';exception when insufficient_privilege then null;end;
end $$;
rollback;
