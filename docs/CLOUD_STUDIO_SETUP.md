# Private category studio: deployment and operations

## What is implemented

The Vercel app serves `/create`, `/design`, and `/api/studio/*`. House is the first enabled category. Car, Animal, Flower and Free format are visible but disabled until their construction modules exist. Legacy demonstrations remain at `/create/demo` and are labelled as demonstrations.

The cloud path is: category → 1–3 photos → Generate → private uploads → durable job → category-specific image interpretation → semantic scene plan → deterministic real-part compiler → whole-assembly checks → immutable artifact → actual-model preview, parts and interactive instructions. Default detail is balanced; detail and instruction pace can change after the first result. There are no payments, prices or orders.

Supabase provides server-managed anonymous identity, optional email linking/sign-in, Postgres, private object storage, the queue and per-design progress. A separate **long-running Node 24 worker** executes jobs. A Vercel request does not keep generation alive; closing a tab does not cancel its job. Trigger.dev is not required by this implementation.

## 1. Choose the project

Use a dedicated BrickMade Supabase project. Sharing a project is technically possible, but shares Auth settings, service credentials, storage, capacity and operational changes. Prefixing these tables prevents name clashes; it does not isolate the project-level settings. Leave the wine project untouched. Decide whether to upgrade based on Supabase's current active-project limits and your needs; this code does not require a paid database tier for private testing.

## 2. Prepare Supabase

1. In the selected project, open SQL Editor and run the exact contents of [`202610150001_studio.sql`](../supabase/migrations/202610150001_studio.sql), once. Alternatively use Supabase CLI linked to that project and `supabase db push`. Review the project reference before applying. This migration creates only BrickMade-prefixed objects and two new private buckets; it must not be blindly rerun against an already migrated project.
2. Under Authentication → Providers, enable **Anonymous Sign-Ins**. Keep email enabled for optional collection recovery. Anonymous users are real private identities, but clearing cookies before linking an email can lose access to that guest collection.
3. Under Authentication → Email Templates, include `{{ .Token }}` in **Change Email Address** and **Magic Link** templates. The UI accepts the numeric code; a link-only template will not provide that experience. Configure production SMTP before broader testing. Supabase's default email service has restricted recipients/rate limits.
4. Copy the project URL and keys into hosting environment settings below. Never paste keys into a GitHub issue, source file or chat.
5. Buckets `bm-inputs` and `bm-designs` must stay **private**. No public insert/update policies are required. The app API issues scoped signed upload tickets; the worker checks declared length, SHA-256 and actual JPEG input before analysis.

## 3. Vercel environment variables

Set these for **Production** in the existing `brickmade` Vercel project, then redeploy. Framework preset is **Next.js**, root `./`, normal build defaults. The previous standalone API used a different preset; the full app now includes Next.js server routes.

| Variable | Secret? | Value |
| --- | --- | --- |
| `SUPABASE_URL` | No | Dedicated project's `https://…supabase.co` root |
| `SUPABASE_PUBLISHABLE_KEY` | No | Project publishable key; legacy `SUPABASE_ANON_KEY` is also supported |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Server service-role JWT or Supabase secret key; bypasses RLS, never expose |
| `BRICKMADE_APP_ORIGIN` | No | `https://brickmade.vercel.app`, or the exact custom HTTPS origin |

No Supabase service credential uses a `NEXT_PUBLIC_` name. The browser receives HttpOnly cookies and narrow upload/download tickets, not a Supabase session token or service key. Keep old `OPENAI_API_KEY`, `OPENAI_MODEL`, `BRICKMADE_ACCESS_TOKEN` and `BRICKMADE_ALLOWED_ORIGINS` if continuing the explicitly separate legacy `/create/demo` photo interpreter. The new studio does not ask users for that private test code.

## 4. Run the durable worker

Choose a host supporting an always-running **Node 24** process or Docker worker (Render background worker, Railway service, Fly machine, or your own server). This is separate from Supabase's database and Vercel's short-lived API requests. A Render blueprint is included at [`render.yaml`](../render.yaml); using it creates a host service and may incur hosting charges. No service or subscription has been created by this repository.

Build from [`worker.Dockerfile`](../worker.Dockerfile). Or on a Node 24 host run `npm ci --omit=dev` then `npm run worker`. Set:

| Variable | Secret? | Value |
| --- | --- | --- |
| `SUPABASE_URL` | No | Same dedicated project |
| `SUPABASE_PUBLISHABLE_KEY` | No | Same publishable/legacy anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Same server-only service credential |
| `OPENAI_API_KEY` | **Yes** | Your OpenAI project key, entered only in the worker host's secrets |
| `OPENAI_MODEL` | No | `gpt-5.2` default; must support image input, Responses and strict structured output |
| `OPENAI_REASONING_EFFORT` | No | `high` default; `low`, `medium` or `high` supported |

The OpenAI key already stored in Vercel is **not automatically available to this worker**. Copy it directly between the providers' secret settings. The server does not infer missing dimensions or generate arbitrary unsupported parts. A stronger vision model can improve interpretation; it cannot remove the current compiler's geometry limits.

For local work copy `.env.example` to ignored `.env.local`, fill values privately, run `npm ci`, `npm run dev`, and in another terminal `npm run worker`. `BRICKMADE_LOCAL_SUPABASE=1` is exclusively for an explicitly selected HTTP **loopback** Supabase test stack. Do not set it on hosted production. HTTPS remains required for external Supabase addresses.

## 5. Activation smoke test

1. Open `/api/studio/config`: `configured:true` means the app has syntactically valid cloud settings, **not** that Auth, SQL or a worker has been verified.
2. Choose House at `/create`, add one clear exterior photo and Generate. Uploads start only at Generate. Confirm it reaches interpreting, planning, compiling, checking and completed. A job remaining queued usually means the worker is not running or points to a different project.
3. Reload the result mid-generation; it should resume the saved job. Cancel another job and confirm it never publishes a design.
4. Open the actual model, inspect adaptations, Parts and Builder. Check piece totals agree. Change detail; the new version reuses the saved interpretation without another photo call. Changing instruction pace must preserve the geometry and inventory.
5. Complete a step, wait for cloud save, reload. Link a guest email using the code, then sign in on another device and open the saved build/progress.
6. Test with a second independent user; their collection and private artifact endpoints must not expose the first user's projects.

Real hosted OpenAI, SMTP, and provider access must be checked using your accounts. CI's photo-analysis fixture is explicit and never enabled in the production worker.

## Recovery, limits and diagnostics

- The API reports a safe stage, code and request ID. Worker events contain job IDs/stages/counts; never photo content, signed URLs, email codes or secrets. Search Vercel logs by request ID and worker logs by job ID.
- Each owner has at most two pending jobs and ten submissions per rolling day; the shared private-test cap is fifty/day. Project reservations are capped at twenty/owner/day. These database limits are atomic. Enable Supabase Auth abuse protection/CAPTCHA before broad public access; creating fresh anonymous identities bypasses per-person limits. Global generation cap still applies.
- Workers claim with `SKIP LOCKED`, owner isolation, a maximum of four live workers, three lease attempts and a 180-second lease renewed every 15 seconds. CPU compilation runs in a separate thread so renewals and cancellation stay responsive. A compile has a 90-second budget and at most two bounded repair attempts.
- Description checkpoints survive replacement workers. If a worker dies after issuing a paid photo call but before saving the result, recovery fails explicitly instead of automatically repeating that call. A user-initiated retry/new build can issue a new provider request. Cancellation cannot reverse provider processing already started.
- Publication uses a lease-specific immutable object path. A stale worker cannot replace a published artifact. An ambiguous publication response never triggers immediate deletion of a potentially committed artifact.
- Input reservations expire after 24 hours. The worker checks expiry before analysis. A running worker deletes expired input and unpublished artifact objects every ten minutes, in batches; outages can delay physical deletion. Published designs have no automatic expiry. Supabase/provider backups and OpenAI retention have separate policies; `store:false` is set on Responses, but is not a promise of zero retention.
- Progress is scoped to an artifact hash and exact piece IDs. Optimistic versions stop competing tabs from silently overwriting each other; the UI lets a user load cloud progress after conflict. Local progress remains available when the network is unavailable.
- Source-backed geometry and sampled collision/support/access checks are digital evidence. They do **not** certify physical tolerances, strength, part stock or pixel-level likeness. Physically build representative samples before claiming buildability in public marketing.

## Verification available without user credentials

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- `npm run test:e2e`: local mobile and legacy prototype coverage; mocked service cases are identified in tests. New artifact fixtures are compiled and digitally checked using the native Node worker code.
- GitHub workflow **Verify BrickMade durable database** starts real PostgreSQL/PostgREST, applies the actual migration, checks owner RLS, idempotency, lease recovery/fencing, cancellation, publication and progress conflicts.
- Workflow **Verify private Studio end to end** starts isolated real Supabase Auth/Storage/Postgres and the actual Next.js app and worker/compiler. Only the vision call is an explicit CI fixture. It exercises private upload, reload recovery, variants, frozen artifact import, progress and a separate owner. No user database or OpenAI key is used.
