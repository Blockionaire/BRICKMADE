-- READ ONLY: run in the shared project's SQL Editor before installation.
-- One result makes it easy to copy the structure/policy report for review.
-- Does not select application records or API keys. Redact private constants
-- in policy expressions before sharing the report.
select jsonb_pretty(jsonb_build_object(
  'brickmade_schema_exists',
  to_regnamespace('brickmade') is not null,

  'existing_brickmade_tables',
  (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    from (
      select table_schema, table_name
      from information_schema.tables
      where table_schema = 'brickmade'
         or (table_schema = 'public' and left(table_name, 3) = 'bm_')
    ) t
  ),

  'existing_brickmade_functions',
  (
    select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb)
    from (
      select n.nspname as schema_name, p.proname as function_name
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'brickmade'
         or (n.nspname = 'public' and left(p.proname, 3) = 'bm_')
    ) f
  ),

  'brickmade_buckets',
  (
    select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb)
    from (
      select id, public as publicly_readable
      from storage.buckets
      where id in ('bm-inputs', 'bm-designs')
    ) b
  ),

  'access_policies',
  (
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
    from (
      select schemaname, tablename, policyname,
             roles, cmd, qual, with_check
      from pg_policies
      where schemaname not in ('pg_catalog', 'information_schema', 'auth')
        and roles && array['public', 'authenticated', 'anon']::name[]
      order by schemaname, tablename, policyname
    ) p
  ),

  'public_table_security',
  (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    from (
      select c.relname as table_name,
             c.relrowsecurity as rls_enabled,
             has_table_privilege(
               'authenticated', c.oid, 'SELECT'
             ) as signed_in_read_grant
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
      order by c.relname
    ) t
  )
)) as brickmade_preflight;
