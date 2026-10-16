-- Owner-scoped, bounded, deduplicated AI help. Raw questions are not stored.
begin;
create table brickmade.bm_assistant_calls (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 job_id uuid not null, request_key uuid not null, fingerprint text not null check(fingerprint~'^[a-f0-9]{64}$'),
 status text not null default 'started' check(status in ('started','completed','failed')),
 response jsonb, error_code text, created_at timestamptz not null default now(),
 unique(owner_id,request_key), foreign key(job_id,owner_id) references brickmade.bm_jobs(id,owner_id) on delete cascade
);
create index bm_assistant_owner_time on brickmade.bm_assistant_calls(owner_id,created_at);
alter table brickmade.bm_assistant_calls enable row level security;
revoke all on brickmade.bm_assistant_calls from public,anon,authenticated;
grant all on brickmade.bm_assistant_calls to service_role;
create function brickmade.bm_assistant_cleanup() returns void
language sql security definer set search_path=brickmade,pg_temp as $$
 update brickmade.bm_assistant_calls set response=null where created_at<now()-interval '24 hours' and response is not null;
 delete from brickmade.bm_assistant_calls where created_at<now()-interval '7 days';
$$;
create function brickmade.bm_assistant_begin(p_owner uuid,p_job uuid,p_request uuid,p_fingerprint text) returns jsonb
language plpgsql security definer set search_path=brickmade,pg_temp as $$
declare c brickmade.bm_assistant_calls;
begin
 perform pg_advisory_xact_lock(hashtextextended('brickmade-assistant-budget',0));
 perform brickmade.bm_assistant_cleanup();
 if p_fingerprint!~'^[a-f0-9]{64}$' then raise exception 'invalid-request';end if;
 if not exists(select 1 from brickmade.bm_jobs where id=p_job and owner_id=p_owner and stage='completed' and artifact is not null) then raise exception 'not-found';end if;
 select * into c from brickmade.bm_assistant_calls where owner_id=p_owner and request_key=p_request;
 if found then
  if c.fingerprint<>p_fingerprint or c.job_id<>p_job then raise exception 'assistant-request-conflict';end if;
  if c.status='completed' and c.response is not null then return jsonb_build_object('id',c.id,'cached',true,'response',c.response);end if;
  raise exception 'assistant-request-uncertain';
 end if;
 if (select count(*) from brickmade.bm_assistant_calls where owner_id=p_owner and created_at>now()-interval '24 hours')>=50 or
    (select count(*) from brickmade.bm_assistant_calls where created_at>now()-interval '24 hours')>=500 then raise exception 'assistant-daily-limit';end if;
 if (select count(*) from brickmade.bm_assistant_calls where owner_id=p_owner and status='started' and created_at>now()-interval '2 minutes')>=2 or
    (select count(*) from brickmade.bm_assistant_calls where status='started' and created_at>now()-interval '2 minutes')>=10 then raise exception 'assistant-busy';end if;
 insert into brickmade.bm_assistant_calls(owner_id,job_id,request_key,fingerprint) values(p_owner,p_job,p_request,p_fingerprint) returning * into c;
 return jsonb_build_object('id',c.id,'cached',false);
end $$;
create function brickmade.bm_assistant_finish(p_owner uuid,p_call uuid,p_response jsonb,p_error text default null) returns boolean
language plpgsql security definer set search_path=brickmade,pg_temp as $$
begin
 if (p_response is null and p_error is null) or (p_response is not null and (jsonb_typeof(p_response)<>'object' or octet_length(p_response::text)>16000 or p_error is not null)) or (p_error is not null and p_error!~'^[a-z-]{1,60}$') then raise exception 'invalid-request';end if;
 update brickmade.bm_assistant_calls set status=case when p_error is null then 'completed' else 'failed' end,response=p_response,error_code=p_error where id=p_call and owner_id=p_owner and status='started';
 return found;
end $$;
revoke all on function brickmade.bm_assistant_begin(uuid,uuid,uuid,text),brickmade.bm_assistant_finish(uuid,uuid,jsonb,text),brickmade.bm_assistant_cleanup() from public,anon,authenticated;
grant execute on function brickmade.bm_assistant_begin(uuid,uuid,uuid,text),brickmade.bm_assistant_finish(uuid,uuid,jsonb,text),brickmade.bm_assistant_cleanup() to service_role;
notify pgrst,'reload schema';
commit;
