\set ON_ERROR_STOP on
begin;
do $$
declare c text; created jsonb; project uuid; photo uuid; j brickmade.bm_jobs; claimed brickmade.bm_jobs; variant brickmade.bm_jobs;
 options jsonb:='{"version":1,"category":"house","detail":"normal","size":"compact","pace":"medium"}';
 owner uuid:='11111111-1111-4111-8111-111111111111';
begin
 foreach c in array array['flower','car','animal','free','house'] loop
  options:=jsonb_set(options,'{category}',to_jsonb(c));
  if not brickmade.bm_valid_options(options) then raise exception 'Options rejected %',c;end if;
  created:=brickmade.bm_create_project(owner,c,jsonb_build_array(jsonb_build_object('bytes',100,'sha256',repeat('a',64))));
  project:=(created->'project'->>'id')::uuid;photo:=(created->'assets'->0->>'id')::uuid;
  begin perform brickmade.bm_submit_job(owner,project,array[photo],jsonb_set(options,'{category}','"boat"'),gen_random_uuid());raise exception 'Unknown category accepted';exception when others then if sqlerrm<>'invalid-options' then raise;end if;end;
  begin perform brickmade.bm_submit_job(owner,project,array[photo],jsonb_set(options,'{category}',to_jsonb(case when c='house' then 'car'::text else 'house'::text end)),gen_random_uuid());raise exception 'Cross-category project accepted';exception when others then if sqlerrm<>'not-found' then raise;end if;end;
  j:=brickmade.bm_submit_job(owner,project,array[photo],options,gen_random_uuid());
  if c<>'house' then
   claimed:=brickmade.bm_claim_job('legacy-house-worker',180);
   if claimed.id is not null then raise exception 'Legacy worker claimed new category';end if;
  end if;
  perform brickmade.bm_report_worker('category-fixture','idle',null,'fixture',array[c],true);
  claimed:=brickmade.bm_claim_job('category-fixture',180);
  if claimed.id<>j.id or claimed.id is null then raise exception 'Capable worker could not claim %',c;end if;
  update brickmade.bm_jobs set stage='completed',lease_token=null,lease_until=null,checkpoint=jsonb_build_object('description',jsonb_build_object('category',c),'providerModel','fixture-model','moduleVersion','fixture-module','inputHashes',jsonb_build_array(repeat('a',64))) where id=j.id;
  variant:=brickmade.bm_submit_job(owner,project,'{}',options,gen_random_uuid(),j.id);
  if variant.checkpoint->>'providerModel'<>'fixture-model' or variant.checkpoint->>'parent'<>j.id::text or variant.checkpoint->'inputHashes'<>jsonb_build_array(repeat('a',64)) then raise exception 'Variant provenance lost';end if;
  if cardinality(variant.input_ids)<>0 then raise exception 'Variant requires original private photos';end if;
  perform brickmade.bm_cancel_job(owner,variant.id);
 end loop;
end $$;
rollback;
