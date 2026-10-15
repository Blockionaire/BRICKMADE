# Connect the shared Supabase project

Selected project: **`https://dqwkbtsstvakcvlnwvwk.supabase.co`**. These instructions prepare the existing Vercel app for private House photo tests. Code and automated tests do not apply changes to this hosted database.

## 1. Check the other applications first

Open [this project's SQL Editor](https://supabase.com/dashboard/project/dqwkbtsstvakcvlnwvwk/sql/new). Paste and run [shared-project-preflight.sql](../supabase/shared-project-preflight.sql). It is read-only and reports schema names, bucket settings, grants and access policies; it does not select application records or API keys. Share the resulting structure/policy report for review, keeping any private constants in policy expressions redacted.

We need to check whether any other app grants all signed-in users access to its data. Supabase guest users also receive the `authenticated` role. A separate BrickMade schema does not change those existing policies. Do not enable anonymous sign-ins until this review is complete. Do not edit unrelated apps' policies or email settings as part of installation.

## 2. Install BrickMade's objects

After reviewing the report, for a new installation run these files in SQL Editor, **one at a time, in order**:

1. [202610150001_studio.sql](../supabase/migrations/202610150001_studio.sql)
2. [202610150002_isolate_schema.sql](../supabase/migrations/202610150002_isolate_schema.sql)

If migration one is already installed in `public`, skip it and run only migration two. If `brickmade` already exists or any `bm_` names belong to another app, inspect that before proceeding. Each migration is transactional. Migration two preserves existing BrickMade rows, owner policies and grants while moving its five tables and eleven functions into `brickmade`. It refuses to overwrite an existing schema.

In **Data API settings → Exposed schemas**, add `brickmade` and **keep all current entries**. In Table Editor's schema selector, choose `brickmade`. Storage has two private buckets: `bm-inputs` and `bm-designs`. Leave them private.

After the access review, enable **Anonymous Sign-Ins** in Authentication settings. For this first same-browser guest test, leave existing email providers, confirmation settings and templates unchanged. Guest collections require their browser cookies until optional account linking is configured.

## 3. Connect Vercel and redeploy

In the existing `brickmade` project's **Production environment variables**, add:

| Variable | Value | Secret? |
| --- | --- | --- |
| `SUPABASE_URL` | `https://dqwkbtsstvakcvlnwvwk.supabase.co` | No |
| `SUPABASE_PUBLISHABLE_KEY` | This project's publishable key | No |
| `SUPABASE_SERVICE_ROLE_KEY` | This project's server secret key or legacy service-role key | **Yes** |
| `BRICKMADE_APP_ORIGIN` | `https://brickmade.vercel.app` | No |

Copy keys directly from Supabase's API-key settings into Vercel. Keep secrets out of chat, GitHub and browser-facing `NEXT_PUBLIC_` variables. The service key has access to the shared project, so only trusted server processes may receive it. Redeploy after saving. Use the **Next.js** application preset.

## 4. Start the generation worker

The database stores jobs; a separate running worker processes them. Vercel alone will not execute this queue. For an initial test, a trusted computer with Node 24 is enough; no extra hosting account is required.

Clone the current repository and run `npm ci`. Copy `.env.example` to ignored `.env.local` and fill in:

- The same three `SUPABASE_` variables as Vercel.
- `OPENAI_API_KEY`: your secret key, copied directly into `.env.local` or a worker host's secret settings.
- `OPENAI_MODEL=gpt-5.2` and `OPENAI_REASONING_EFFORT=high`.

Run `npm run worker` and keep it running through the test. It connects outward; no public port or tunnel is needed. The key already saved in Vercel is not automatically copied to this worker. A permanent worker host can be configured later; [the operations guide](CLOUD_STUDIO_SETUP.md) covers deployment and cleanup behavior.

## 5. Try one House photo

Open [the Studio](https://brickmade.vercel.app/create), choose House, add a clear exterior photo and press Generate. It should progress from queued through interpretation, planning, compilation and checking to a saved model. The result uses real placements for its preview, parts and instructions.

If a job stays queued, check that the worker is running against this same project. A `database-schema` error means `brickmade` is missing from exposed schemas; `database-migration` means the migrations or API schema cache need checking. `/api/studio/config` reporting `configured:true` only checks that variables are present and syntactically valid; it does not prove the full workflow is ready.
