-- Service-only worker presence; no application data or other-app settings change.
begin;
create table brickmade.bm_workers (
 id text primary key check(length(id) between 1 and 100),
 seen_at timestamptz not null default now(),
 state text not null check(state in ('idle','working','stopped')),
 job_id uuid references brickmade.bm_jobs(id) on delete set null,
 runtime_version text not null check(length(runtime_version) between 1 and 100),
 categories text[] not null,
 vision_configured boolean not null
);
alter table brickmade.bm_workers enable row level security;
revoke all on brickmade.bm_workers from public,anon,authenticated;
grant all on brickmade.bm_workers to service_role;
create function brickmade.bm_report_worker(p_worker text,p_state text,p_job uuid,p_version text,p_categories text[],p_vision boolean)
returns void language plpgsql security definer set search_path=brickmade,pg_temp as $$
begin
 if p_state not in ('idle','working','stopped') or p_categories is null
  or cardinality(p_categories) not between 1 and 5
  or not p_categories<@array['house','car','animal','flower','free']::text[]
 then raise exception 'invalid-worker';end if;
 insert into brickmade.bm_workers(id,seen_at,state,job_id,runtime_version,categories,vision_configured)
 values(p_worker,now(),p_state,p_job,p_version,p_categories,p_vision)
 on conflict(id) do update set seen_at=now(),state=excluded.state,job_id=excluded.job_id,
 runtime_version=excluded.runtime_version,categories=excluded.categories,vision_configured=excluded.vision_configured;
 delete from brickmade.bm_workers where seen_at<now()-interval '7 days';
end $$;
create function brickmade.bm_worker_health() returns jsonb
language sql stable security definer set search_path=brickmade,pg_temp as $$
 select jsonb_build_object(
 'online',(select count(*) from brickmade.bm_workers where seen_at>now()-interval '60 seconds' and state<>'stopped'),
 'visionConfigured',(select count(*) from brickmade.bm_workers where seen_at>now()-interval '60 seconds' and state<>'stopped' and vision_configured),
 'categories',coalesce((select jsonb_agg(distinct c) from brickmade.bm_workers w cross join unnest(w.categories) c where w.seen_at>now()-interval '60 seconds' and w.state<>'stopped' and w.vision_configured),'[]'::jsonb),
 'queued',(select count(*) from brickmade.bm_jobs where stage='queued' and not cancel_requested));
$$;
revoke all on function brickmade.bm_report_worker(text,text,uuid,text,text[],boolean),brickmade.bm_worker_health() from public,anon,authenticated;
grant execute on function brickmade.bm_report_worker(text,text,uuid,text,text[],boolean),brickmade.bm_worker_health() to service_role;
notify pgrst,'reload schema';
commit;
