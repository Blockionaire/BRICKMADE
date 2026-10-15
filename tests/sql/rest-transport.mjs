import {createHmac,randomUUID} from "node:crypto";
import {strict as assert} from "node:assert";
import {setTimeout as pause} from "node:timers/promises";
import {supabaseClient} from "../../server/supabase.mjs";
const secret="brickmade-postgrest-fixture-secret-0123456789";
function jwt(role,sub){const enc=v=>Buffer.from(JSON.stringify(v)).toString("base64url");const body=enc({alg:"HS256",typ:"JWT"})+"."+enc({role,sub,exp:Math.floor(Date.now()/1000)+3600});return body+"."+createHmac("sha256",secret).update(body).digest("base64url");}
const owner="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222";
const env={SUPABASE_URL:"https://fixture.supabase.co",SUPABASE_PUBLISHABLE_KEY:"fixture-public",SUPABASE_SERVICE_ROLE_KEY:jwt("service_role",owner)};
const fetcher=(url,options)=>{const u=new URL(url);return fetch("http://127.0.0.1:3009"+u.pathname.replace(/^\/rest\/v1/,"")+u.search,options);};
const db=supabaseClient({env,fetcher});
let ready=false;for(let i=0;i<30;i++){try{await db.rows("bm_projects","limit=1");ready=true;break;}catch{await pause(2000);}}
assert(ready,"PostgREST did not become ready after schema reload");
const created=await db.rpc("bm_create_project",{p_owner:owner,p_category:"house",p_inputs:[{bytes:100,sha256:"a".repeat(64)}]});
assert(created.project.id);assert.equal(created.assets.length,1);
const job=await db.rpc("bm_submit_job",{p_owner:owner,p_project:created.project.id,p_inputs:[created.assets[0].id],p_options:{version:1,category:"house",detail:"normal",size:"compact",pace:"medium"},p_request:randomUUID(),p_parent:null});
assert.equal(job.stage,"queued");
const claimed=await db.rpc("bm_claim_job",{p_worker:"rest-transport",p_seconds:180});
assert.equal(claimed.id,job.id);assert(claimed.lease_token);
assert.equal(await db.rpc("bm_heartbeat",{p_job:job.id,p_lease:claimed.lease_token,p_seconds:180}),true);
const ownRows=await db.request("/rest/v1/bm_jobs?select=id",{service:false,token:jwt("authenticated",owner)});
const otherRows=await db.request("/rest/v1/bm_jobs?select=id",{service:false,token:jwt("authenticated",other)});
assert.equal(ownRows.length,1);assert.equal(otherRows.length,0);
await assert.rejects(()=>db.request("/rest/v1/rpc/bm_claim_job",{method:"POST",body:{p_worker:"untrusted",p_seconds:180},service:false,token:jwt("authenticated",other)}));
console.log("PASS: actual HTTP RPC/composite/scalar decoding, owner reads, cross-owner RLS and denied worker privileges");
