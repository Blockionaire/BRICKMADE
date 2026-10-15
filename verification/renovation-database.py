from pathlib import Path
import subprocess


def run(source, success=True):
    r = subprocess.run(['psql', '-v', 'ON_ERROR_STOP=1'], input=source, text=True, capture_output=True)
    if (r.returncode == 0) != success:
        raise RuntimeError((r.stdout + r.stderr)[-6000:])


owner = '11111111-1111-4111-8111-111111111111'
partner = '22222222-2222-4222-8222-222222222222'
other = '33333333-3333-4333-8333-333333333333'
guest = '44444444-4444-4444-8444-444444444444'
unknown = '55555555-5555-4555-8555-555555555555'
run(f"""
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
insert into auth.users values('{owner}',false),('{partner}',false),('{other}',false),('{guest}',true);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon;
create table public.ovs_state(id text primary key,data jsonb);
insert into public.ovs_state values('main','{{"test":"preserved shared state"}}');
alter table public.ovs_state enable row level security;
grant select,insert,update,delete on public.ovs_state to anon,authenticated,service_role;
create policy "Allow all" on public.ovs_state for all to public using(true) with check(true);
""")
template = Path('renovation-access.sql').read_text()


def members(*ids):
    return template.replace('array[]::uuid[]', 'array[' + ','.join("'"+v+"'" for v in ids) + ']::uuid[]')


for invalid in [template, members(unknown), members(guest), members(owner, unknown)]:
    run(invalid, success=False)
    run("""do $$begin
    if to_regprocedure('public.ovs_can_access()') is not null then raise exception 'Failed setup left a function';end if;
    if exists(select 1 from pg_policy where polname='approved_group_access_guard') then raise exception 'Failed setup left a guard';end if;
    end $$;""")
run(members(owner, partner))
run(members(owner), success=False)
for user, allowed in [(owner, True), (partner, True), (other, False), (guest, False)]:
    run(f"""begin;
    set local role authenticated;
    select set_config('request.jwt.claim.sub','{user}',true);
    do $$declare changed integer;begin
    if public.ovs_can_access() is distinct from {str(allowed).lower()} then raise exception 'Incorrect access RPC';end if;
    if (select count(*) from public.ovs_state)<>{1 if allowed else 0} then raise exception 'Incorrect shared read access';end if;
    {'insert into public.ovs_state values(\'fixture\',\'{}\');' if allowed else "begin insert into public.ovs_state values('fixture','{}');raise exception 'Unapproved insert';exception when insufficient_privilege then null;end;"}
    update public.ovs_state set data='{{"test":"updated"}}' where id='main';get diagnostics changed=row_count;
    if changed<>{1 if allowed else 0} then raise exception 'Incorrect update access';end if;
    delete from public.ovs_state where id='main';get diagnostics changed=row_count;
    if changed<>{1 if allowed else 0} then raise exception 'Incorrect delete access';end if;
    end $$;
    rollback;""")
run("""begin;
set local role anon;
do $$begin
 if exists(select 1 from public.ovs_state) then raise exception 'Anonymous read allowed';end if;
 begin perform public.ovs_can_access();raise exception 'Anonymous RPC allowed';exception when insufficient_privilege then null;end;
 begin insert into public.ovs_state values('anonymous','{}');raise exception 'Anonymous write allowed';exception when insufficient_privilege then null;end;
end $$;
rollback;
set role service_role;
do $$begin
 if (select data->>'test' from public.ovs_state where id='main')<>'preserved shared state' then raise exception 'Existing shared data or maintenance access changed';end if;
end $$;
reset role;
""")
print('PASS: real SQL/RPC, approved shared CRUD, denied unapproved/guest/anonymous access, atomic invalid setup and preserved state')
