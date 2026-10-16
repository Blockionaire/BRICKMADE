# Account setup needed from the owner

Updated 2026-10-16. These are account actions, not requests for keys in chat. No paid resource has been created. The code can be tested without these accounts, but hosted photo generation and real-photo/physical evaluation cannot be completed without them.

## 1. Protect the renovation app before enabling BrickMade guests

The supplied policy report shows `public.ovs_state` permits every API caller. The renovation app currently uses the public key without a user login. Its replacement must introduce approved-user sign-in and the database guard together; changing the policy alone would lock out the existing frontend.

- Give this Codex session's GitHub integration repository access to **Blockionaire/First-series-of-apps-JP**. Inspect installed integrations at [GitHub settings](https://github.com/settings/installations), or the repository selection in your Codex environment. The integration can read its public source but GitHub rejected writes with HTTP 403, `Resource not accessible by integration`. A password or personal access token is not needed in chat.
- In [Supabase Authentication → Users](https://supabase.com/dashboard/project/dqwkbtsstvakcvlnwvwk/auth/users), choose or create only the non-guest accounts allowed into the renovation app. Set their passwords privately. New BrickMade guests must never become renovation members automatically.
- The prepared renovation update contains `RENOVATION_ACCESS.md`, gated versions of both connected HTML pages, isolated Auth session storage, and `renovation-access.sql`. Enter the approved accounts' UUIDs **directly into your private SQL copy**. Keep the approved list out of chat.
- Follow that guide to coordinate installation, verify approved accounts, and test denied guest/unapproved/unauthenticated access. Only then enable BrickMade anonymous sign-ins. Existing records are preserved; other apps' owner policies are unchanged.

The patch has ten passing mocked browser scenarios and an isolated real PostgreSQL policy test. Its live sign-in/cutover still requires your account configuration. Login and RLS protect live data; they do not remove embedded renovation seed content from existing public source or Git history.

## 2. Install the BrickMade database release

Use this shared project's [SQL Editor](https://supabase.com/dashboard/project/dqwkbtsstvakcvlnwvwk/sql/new). Run only unapplied migrations, one at a time in order:

1. [Initial Studio](../supabase/migrations/202610150001_studio.sql)
2. [Dedicated BrickMade schema](../supabase/migrations/202610150002_isolate_schema.sql)
3. [Worker health](../supabase/migrations/202610160001_worker_health.sql)
4. [Category jobs and variant provenance](../supabase/migrations/202610160002_category_jobs.sql)
5. [Bounded build assistant](../supabase/migrations/202610160003_build_assistant.sql)

Do not rerun an installed migration. If uncertain, run the [read-only preflight](../supabase/shared-project-preflight.sql) and inspect installed objects first. Preserve other applications' schemas and buckets. Add **`brickmade`** to Data API → Exposed schemas, keeping existing entries. Leave `bm-inputs` and `bm-designs` private. These SQL files do not enable anonymous sign-ins or alter shared email providers/templates.

## 3. Add server settings to Vercel and redeploy

Open your existing `brickmade` Vercel project's Production environment settings. Use the Next.js preset, repository root `./`.

| Variable | Exact source/value | Secret? |
| --- | --- | --- |
| `SUPABASE_URL` | `https://dqwkbtsstvakcvlnwvwk.supabase.co` | No |
| `SUPABASE_PUBLISHABLE_KEY` | This project's publishable key in Supabase API-key settings | No |
| `SUPABASE_SERVICE_ROLE_KEY` | This project's server secret key or legacy service-role key | **Yes** |
| `BRICKMADE_APP_ORIGIN` | `https://brickmade.vercel.app` | No |
| `OPENAI_API_KEY` | Keep your existing OpenAI project key here; the build assistant uses it server-side | **Yes** |
| `OPENAI_MODEL` | Keep your selected image/Responses/strict-output-capable model; repository default `gpt-5.2` | No |

No secret uses a `NEXT_PUBLIC_` name. The existing legacy test token/origins can remain for `/create/demo`; the new Studio does not request a test code. `OPENAI_ASSISTANT_MODEL` optionally overrides only build-help responses. Redeploy after saving.

## 4. Run the durable worker

For initial private testing, use a trusted computer with Node 24. No additional host or Supabase paid upgrade is required solely for this test.

1. Clone/update this repository; run `npm ci`.
2. Copy `.env.example` to the ignored `.env.local`.
3. Enter the same three `SUPABASE_` settings, `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_REASONING_EFFORT=high` privately. The key in Vercel is not automatically available on this computer.
4. Run `npm run worker` and leave it running. It requires no public port or tunnel.
5. In another terminal run `npm run studio:doctor`. It checks Auth, schema, private buckets and fresh category-capable worker heartbeats, without creating a user/job or calling OpenAI. Resolve any failed check before generating. An advertised provider setting is not proof the key/model works; the first real photo test checks that.

Permanent hosting can come later. The existing Render/Docker configuration is optional and may incur charges if you choose to provision it.

## 5. Supply the evidence only a real test can provide

Once the hosted path is ready, upload one clear House exterior photo at [Create](https://brickmade.vercel.app/create), then inspect the actual model, adaptations, parts and instructions. Use owned/permitted photos; no photos or API secrets need to be pasted into chat.

For systematic quality work, prepare 5–10 House subjects with varied footprints/roofs/window layouts using [PHOTO_BENCHMARK.md](PHOTO_BENCHMARK.md). Run the offline validator first; live mode requires explicit provider-call limits. Add representative category photos afterward. No real photo/provider result has been claimed from synthetic CI fixtures.

Finally, download **Physical test pack** from Parts and build representative models with actual pieces. Record fit, insertion access, clutch, balance, instruction clarity and resemblance against every source view. Digital checks and AI explanations cannot supply this physical evidence. Marketplace list import additionally needs reviewed provider identities and a real private import-acceptance test; a CSV export is already available without those mappings.
