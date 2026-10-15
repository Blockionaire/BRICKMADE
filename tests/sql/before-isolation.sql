-- Existing unrelated app data and settings must survive migration 2 untouched.
create table public.shared_app_fixture(id integer primary key,owner_id uuid not null,label text not null);
insert into public.shared_app_fixture values(1,'22222222-2222-4222-8222-222222222222','Existing app data');
alter table public.shared_app_fixture enable row level security;
grant select on public.shared_app_fixture to authenticated;
create policy shared_app_fixture_owner on public.shared_app_fixture for select to authenticated using(owner_id=auth.uid());
create function public.shared_app_fixture_value() returns text language sql immutable as $$select 'existing function'::text$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('other-app-private','other-app-private',false,1000,array['text/plain']);
insert into auth.users(id) values('33333333-3333-4333-8333-333333333333');
insert into public.bm_projects(id,owner_id,title,category) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','Preserve this existing BrickMade build','house');
