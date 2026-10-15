\set ON_ERROR_STOP on
-- Simulate another app's broad legacy policy. No changes survive this test.
begin;
create policy fixture_other_app_broad_storage on storage.objects
for all to anon,authenticated using(true) with check(true);
grant select,insert,update,delete on storage.objects to anon,authenticated;

do $$
declare created jsonb; path text;
begin
 created:=brickmade.bm_create_project('11111111-1111-4111-8111-111111111111','house','[{"bytes":100,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]');
 path:=created->'assets'->0->>'path';
 insert into storage.objects(bucket_id,name) values('bm-inputs',path);
 -- The third identity's existing project also verifies the migrated FK/owner path.
 insert into storage.objects(bucket_id,name) values('bm-designs','33333333-3333-4333-8333-333333333333/private.json');
 insert into storage.objects(bucket_id,name) values('other-app-private','existing.txt');
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare changed integer;
begin
 if (select count(*) from storage.objects where bucket_id='bm-inputs')<>1 then raise exception 'Owner lost private input access';end if;
 if exists(select 1 from storage.objects where bucket_id='bm-designs') then raise exception 'Broad policy exposed another owner artifact';end if;
 if (select count(*) from storage.objects where bucket_id='other-app-private')<>1 then raise exception 'Other app reads changed';end if;
 begin insert into storage.objects(bucket_id,name) values('bm-inputs','unauthorized.jpg');raise exception 'Broad policy allowed direct private insert';exception when insufficient_privilege then null;end;
 begin insert into storage.objects(bucket_id,name) values('bm-designs','unauthorized.json');raise exception 'Broad policy allowed artifact insert';exception when insufficient_privilege then null;end;
 delete from storage.objects where bucket_id='bm-inputs';get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Broad policy allowed private delete';end if;
 update storage.objects set name='changed.jpg' where bucket_id='bm-inputs';get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Broad policy allowed private update';end if;
 begin update storage.objects set bucket_id='bm-inputs' where bucket_id='other-app-private';raise exception 'Broad policy allowed moving objects into private bucket';exception when insufficient_privilege then null;end;
 insert into storage.objects(bucket_id,name) values('other-app-private','new.txt');
 update storage.objects set name='updated.txt' where bucket_id='other-app-private' and name='new.txt';get diagnostics changed=row_count;
 if changed<>1 then raise exception 'Other app update changed';end if;
 delete from storage.objects where bucket_id='other-app-private' and name='updated.txt';get diagnostics changed=row_count;
 if changed<>1 then raise exception 'Other app delete changed';end if;
end $$;

reset role;
update brickmade.bm_assets set expires_at=now()-interval '1 minute' where bucket='bm-inputs' and owner_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
do $$begin
 if exists(select 1 from storage.objects where bucket_id='bm-inputs') then raise exception 'Broad policy exposed expired input';end if;
end $$;

set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$begin
 if exists(select 1 from storage.objects where bucket_id in ('bm-inputs','bm-designs')) then raise exception 'Broad policy exposed files to unauthenticated caller';end if;
 if not exists(select 1 from storage.objects where bucket_id='other-app-private') then raise exception 'Other app anonymous policy changed';end if;
 begin insert into storage.objects(bucket_id,name) values('bm-inputs','anonymous.jpg');raise exception 'Broad policy allowed anonymous private insert';exception when insufficient_privilege then null;end;
 insert into storage.objects(bucket_id,name) values('other-app-private','anonymous.txt');
 raise notice 'PASS: broad legacy Storage policy cannot bypass BrickMade ownership, expiry or write restrictions; unrelated bucket CRUD preserved';
end $$;
rollback;
