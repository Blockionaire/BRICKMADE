# BrickMade release notes

## 2026-10-15 — Shared-project database separation

BrickMade can use the approved shared small-apps Supabase project for initial private testing. No hosted database changes have been made by this release.

- Added a forward migration into a dedicated `brickmade` schema. It moves only BrickMade's five tables and eleven functions, retaining existing builds, owner policies, grants, foreign keys and event sequences. An existing schema causes installation to fail safely instead of being reused.
- Scoped the server and worker's database requests to `brickmade`; Auth and Storage requests retain their own API behavior. Missing schema exposure/migrations now produce specific setup errors without raw database details.
- Added a read-only shared-project preflight and a [step-by-step activation checklist](SHARED_SUPABASE_QUICKSTART.md) covering migration order, exposed schemas, Vercel variables and a temporary local worker. No third Supabase project, new subscription or worker-host account is required for the initial test.
- Extended real PostgreSQL/PostgREST verification with existing BrickMade rows and a simulated second app. Checks cover preserved app data/functions/buckets, the second app's original public API and owner policy, the moved Storage policy, sequence privileges, and the durable queue in its new schema. The full isolated Supabase/worker/browser workflow now uses the custom schema too.
- Twenty Studio API checks pass, including database profile headers and actionable migration/schema failures. Lint, TypeScript and the full Next.js production build pass.

Supabase Auth, service credentials and resource limits are still shared. Review the other apps' policies before enabling anonymous sign-ins, because guest identities have the `authenticated` role. For the first same-browser guest test, preserve the existing email configuration; optional email recovery can be configured after reviewing compatibility.

## 2026-10-15 — Category-first House Studio

Implementation of the six requested steps is complete. The new cloud workflow is ready for account configuration; it has not been activated against the owner's Supabase/OpenAI accounts. No subscription, worker host or paid resource was created.

### What changed

1. **Visible diagnostics.** Photo-interpretation errors are brought into view with stage and support references. POST connection checks exercise the same origin policy as uploads. Request controllers release reliably after failure/cancellation. Local evidence confirmed offscreen notices and an origin-check mismatch; the exact original live failure remains unconfirmed because the environment's gateway denied the app URL.
2. **Category-first creation and results.** House → one to three photos → Generate → actual saved brick model. Resizing and previews happen locally before submission. Detail, size and instruction pace can change afterward. Other category cards are explicitly in development. The old local/manual workflow remains available at `/create/demo`. GitHub Pages hands photo generation to the full Vercel app.
3. **Private identity and projects.** Supabase-backed anonymous sessions use server-managed HttpOnly cookies. Private upload tickets are scoped to reserved objects. Optional email verification links the same guest collection; sign-in restores it on another device. Saved cards render actual placements. Signing out clears downloaded cloud copies, preserving local demos and server designs.
4. **Durable generation and progress.** Postgres claims, leases, fencing, checkpoints, cancellation, restart recovery, atomic quotas, input expiry and cleanup. Paid interpretation is not automatically repeated after an uncertain interrupted call. Compilation runs off the heartbeat thread. Immutable artifacts preserve exact placements across compiler updates. Progress tracks exact piece IDs and detects competing edits. Background saving survives navigation and does not switch the user's selected build. Saved-version navigation preserves access to checked and in-progress revisions.
5. **Shared contracts and category knowledge.** Strict versioned House/options/artifact contracts, category readiness, versioned image context, semantic scene plans, feature priorities and assembly dependencies. Inventory, sorting bags, construction phases and instructions must account for the same actual pieces. Invalid or unsupported descriptions never silently become demo houses.
6. **House compiler v2.2.** Rectangular/L footprints, one to three storeys, gable/hip/flat/shed roofs, meaningful roof pitch even at compact scale, ridge direction, front/rear/side windows, entrance position, supported decks/internal posts, chimney and garden. Source-backed parts/colors, fitted frames/panes and assembly checks remain mandatory. Bounded repairs disclose omissions; feature-loss limits reject excessively simplified results.

A mobile regression also exposed touch click-through: showing a selected-brick panel during pointer-up could place a link under the compatibility click. Picking now occurs on click, preserving the event target. The failing touch scenario passed after the fix.

### Verification

- Lint and TypeScript pass; both the full Next.js build and GitHub Pages export pass.
- 667 distinct unit/domain/API checks have passing results across the regression and targeted runs: 567 existing checks, 63 House checks (60 construction cases plus three contract/pace/pitch checks), 16 Studio API checks, nine worker recovery/publication checks, and 12 immutable-artifact/repository checks.
- The full mobile/desktop browser run passed 36 scenarios and found the touch issue above; two Supabase-only scenarios were intentionally skipped locally. After the fix, all six affected/new creation, picking, parts-spotlight and animation scenarios passed. This is targeted revalidation, not a claim that the entire browser suite was rerun after that fix.
- GitHub Pages smoke test passed eleven routes, cloud handoff, demo photos, actual meshes, assembly approval, instruction pace, saved progress, parts filtering, glass geometry, connection snapping, Technic fit and contextual assistant, without browser errors or failed local requests.
- Real PostgreSQL/PostgREST CI passed ownership RLS, denied writes/service RPCs, queue idempotency, lease recovery/fencing, publication, cancellation, and progress concurrency/valid-piece checks.
- Real isolated Supabase CI passed anonymous Auth, private Storage, durable jobs, actual native House compilation/checking, reload recovery, variants without repeated photo analysis, frozen builder import, progress after leaving Builder, owner isolation, guest email linking, second-device sign-in and sign-out. Only photo interpretation is an explicit CI fixture; no real OpenAI call or external email was made.
- The non-root Docker worker image compiled and checked a real House without network access or secrets. This verifies packaged dependencies and source/collision resources.
- Verified integration commit: [`2c8d6b6`](https://github.com/Blockionaire/BRICKMADE/commit/2c8d6b6019916f796c62eb4ffd6d9d9fabd50be0). [Full Supabase/worker integration](https://github.com/Blockionaire/BRICKMADE/actions/runs/38724629186) and [database verification](https://github.com/Blockionaire/BRICKMADE/actions/runs/38724629086).

### Activation and limits

Follow [CLOUD_STUDIO_SETUP.md](CLOUD_STUDIO_SETUP.md). A dedicated Supabase project is recommended; the existing wine/shared projects were untouched. Enable anonymous sign-ins and email confirmation, apply the migration, configure code-bearing email templates, add server variables to Vercel, and deploy the long-running worker. The OpenAI key must also be entered directly in that worker host's secret settings; Vercel secrets do not transfer automatically.

House is a bounded, photo-informed construction system. Arbitrary objects, exact photogrammetric reconstruction, pixel-level resemblance, physical tolerances/strength and current part stock are not certified. The broad 64,895-record catalog is not the same as the 327-shape admitted builder workspace. Car, Animal, Flower and Free format remain future generators.

Input reservations expire after 24 hours and are scheduled for deletion by the worker; worker outages can delay physical deletion. Published models remain saved. OpenAI/provider retention and Supabase backups have separate policies. No payments, prices, costs or actual ordering were added.
