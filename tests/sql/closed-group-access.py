"""Verify the manual policy template on real PostgreSQL, never a user database."""
from pathlib import Path
import subprocess


def sql(source, success=True):
    result = subprocess.run(
        ["psql", "-v", "ON_ERROR_STOP=1"], input=source, text=True, capture_output=True
    )
    if (result.returncode == 0) != success:
        raise RuntimeError((result.stdout + result.stderr)[-6000:])
    return result


template = Path("supabase/manual/closed-group-access.sql").read_text()
configured = template.replace("'REPLACE_SCHEMA';", "'public';").replace(
    "'REPLACE_TABLE';", "'closed_group_fixture';"
)
owner = "11111111-1111-4111-8111-111111111111"
partner = "22222222-2222-4222-8222-222222222222"
guest = "44444444-4444-4444-8444-444444444444"
unknown = "55555555-5555-4555-8555-555555555555"


def members(*ids):
    return configured.replace(
        "array[]::uuid[]", "array[" + ",".join("'" + v + "'" for v in ids) + "]::uuid[]"
    )


sql(f"""
alter table auth.users add column is_anonymous boolean not null default false;
insert into auth.users(id,is_anonymous) values('{guest}',true);
create table public.closed_group_fixture(id integer primary key,label text);
insert into public.closed_group_fixture values(1,'Original shared data');
alter table public.closed_group_fixture enable row level security;
grant select,insert,update,delete on public.closed_group_fixture to anon,authenticated,service_role;
create policy legacy_shared_access on public.closed_group_fixture for all to public using(true) with check(true);
""")

for invalid in [template, configured, members(unknown), members(guest), members(owner, unknown)]:
    sql(invalid, success=False)
    sql("""do $$begin
      if exists(select 1 from pg_policies where tablename='closed_group_fixture' and policyname='approved_group_access_guard') then raise exception 'Failed template partially changed permissions';end if;
      if (select label from public.closed_group_fixture where id=1)<>'Original shared data' then raise exception 'Failed template changed data';end if;
    end $$;""")

sql(members(owner, partner))
sql(members(owner), success=False)  # Cannot silently replace existing membership.

for index, user in enumerate([owner, partner]):
    sql(f"""begin;
    set local role authenticated;
    select set_config('request.jwt.claim.sub','{user}',true);
    do $$declare changed integer;begin
      if (select count(*) from public.closed_group_fixture)<>1 then raise exception 'Approved user lost shared read access';end if;
      insert into public.closed_group_fixture values({10+index},'New shared data');
      update public.closed_group_fixture set label='Updated by approved user' where id=1;get diagnostics changed=row_count;
      if changed<>1 then raise exception 'Approved user lost update access';end if;
      delete from public.closed_group_fixture where id={10+index};get diagnostics changed=row_count;
      if changed<>1 then raise exception 'Approved user lost delete access';end if;
      begin alter policy approved_group_access_guard on public.closed_group_fixture using(true);raise exception 'Client can change membership';exception when insufficient_privilege then null;end;
    end $$;
    rollback;""")

for role, user in [("authenticated", "33333333-3333-4333-8333-333333333333"), ("authenticated", guest), ("anon", "")]:
    sql(f"""begin;
    set local role {role};
    select set_config('request.jwt.claim.sub','{user}',true);
    do $$declare changed integer;begin
      if exists(select 1 from public.closed_group_fixture) then raise exception 'Unapproved caller can read shared data';end if;
      begin insert into public.closed_group_fixture values(99,'Unapproved');raise exception 'Unapproved caller can insert shared data';exception when insufficient_privilege then null;end;
      update public.closed_group_fixture set label='Unauthorized';get diagnostics changed=row_count;
      if changed<>0 then raise exception 'Unapproved caller can update shared data';end if;
      delete from public.closed_group_fixture;get diagnostics changed=row_count;
      if changed<>0 then raise exception 'Unapproved caller can delete shared data';end if;
    end $$;
    rollback;""")

sql("""begin;
set local role service_role;
do $$begin
 if (select count(*) from public.closed_group_fixture)<>1 then raise exception 'Service maintenance access changed';end if;
end $$;
rollback;
drop table public.closed_group_fixture;
""")
print("PASS: shared CRUD for approved accounts; other app users, guests and unauthenticated callers denied; invalid configuration fails atomically; existing membership and data retained")
