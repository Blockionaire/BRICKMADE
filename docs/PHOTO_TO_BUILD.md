# Description and photo to build — private prototype

Updated 2026-10-14. The house studio generates actual parts and placements from an editable, bounded house description. It works on GitHub Pages without credentials. Optional OpenAI interpretation proposes that description from one to three resized photos through a private API hosted with the app on Vercel. It does not generate or certify engineering geometry.

## Try it now

Open **Create → Design a house**, choose a starting design and edit proportions, height, roof, colors, windows, chimney and garden. Choose model detail and instruction pace independently, then **Generate my house**. A passing whole-model report is required before saving. Review exposes the actual adaptations; Builder, Parts, sorting bags, counts and saved-card mesh projections all derive from the generated placements. **Edit house description** checks a proposed change before applying it. Generated projects record their compiler revision. A future compiler change resets obsolete piece credit and retains the prior raw save locally where possible. Bump the compiler revision whenever placement semantics change. An edited geometry change resets progress with confirmation; changing instruction pace retains completed piece identities.

The first compiler supports a rectangular footprint, solid brick door details, representative front/rear windows, a flat roof or horizontal courses approximating a gable, chimney and garden. Width/depth snaps to the stud grid. Easy uses larger blocks and omits fitted windows; Normal and Hard add smaller pieces and fitted details. Recorded part/color evidence is mandatory; any palette substitution appears in the adaptations. Source geometry, supported ports, full assembly clearance/access and the 0.4 mm resolution remain the independent checks. Physical fit, strength, exact architectural fidelity, actual measurements and current stock remain untested.

Non-house photos and complex multi-wing structures are outside this release. Unsupported, refused, malformed or incomplete responses do not silently create a demo. Interpretation never saves a project: the user reviews the description and explicitly generates the checked design. The assistant remains the deterministic step assistant.

## Connect OpenAI with Vercel

Vercel now hosts the complete Next.js app and its private photo API in one project. The GitHub Pages prototype remains available at <https://blockionaire.github.io/BRICKMADE/>. Supabase is not needed for this milestone; accounts and shared cloud saves are later work. Existing projects/progress are local to each website origin: moving to Vercel does not automatically transfer GitHub Pages saves.

1. In Vercel, choose **Add New → Project**, import **Blockionaire/BRICKMADE**, name the project **brickmade** (or another available name), and keep the repository root as the Root Directory.
2. This repository's `vercel.json` selects **Next.js**, builds with `npm run build`, and uses `.next` as Output Directory. Use **Node.js 24**. If you already deployed the previous API-only configuration, change the preset to Next.js and remove the old `node scripts/prepare-api.mjs` / `.api-public` overrides. Do not set `GITHUB_PAGES` or `NEXT_PUBLIC_BASE_PATH` on Vercel. Wait for the deployment of the updated repository configuration.
3. In that project's **Settings → Environment Variables**, add these values for **Production**:

   | Name | Value |
   | --- | --- |
   | `OPENAI_API_KEY` | Paste your OpenAI project API key here. |
   | `OPENAI_MODEL` | `gpt-5.2`, or another vision model available to your account that supports Responses API structured outputs. |
   | `BRICKMADE_ACCESS_TOKEN` | A separate random private test code, at least 24 characters. Generate one with `openssl rand -hex 32`. |
   | `BRICKMADE_ALLOWED_ORIGINS` | Your exact production app origin, e.g. `https://brickmade.vercel.app`. Optionally append `,https://blockionaire.github.io` to also connect the Pages prototype. No paths or trailing slash. |

4. Deploy/redeploy after setting the variables. Use the production `https://…vercel.app` address. If Vercel Deployment Protection is enabled for production, allow the production API to be reached by the browser; its private test code still protects every interpretation. Preview deployments may remain protected.
5. Open the Vercel-hosted app. In **Account → Connect photo interpretation**, paste that same Vercel root address and the separate private test code, then **Check & connect**. Never paste the OpenAI key into BrickMade. The app detects ordinary OpenAI key prefixes and rejects them before making a request. Connection details are stored only in this browser tab's session storage.
6. In **Create**, select real house photos, continue to **House studio**, and confirm sharing. **Interpret my photos** sends the first three real selected photos. Review the AI observations and uncertainty notes, correct the choices, then generate.

The connection check verifies deployment reachability, private authorization and the protocol without making a provider call. The OpenAI key/model is exercised by the first real interpretation. Account access and a real key are required for that integration check; automated tests use explicit mocked provider responses and spend no API credits.

Do not commit secrets, put them in `NEXT_PUBLIC_` variables, or add them as GitHub Pages build variables. `.env.local` and `.vercel` are ignored. `.env.example` contains placeholders only. A rotated private test code requires reconnecting the browser. Changes to Vercel variables require redeployment.

## API and privacy boundaries

`POST /api/analyze` accepts exactly `{ version: 1, consent: true, photos: [dataJpeg…] }`, one to three photos, with `Authorization: Bearer <private-test-code>`. `GET /api/status` requires the same authorization. CORS admits only configured exact origins; authorization is enforced independently of Origin. The browser omits cookies.

The browser sequentially resizes photos to at most 1280 pixels, re-encodes JPEG to strip source metadata, and caps each encoded photo at 700 KiB. The API bounds the total body to 4 MiB, checks canonical base64, JPEG signatures and bounded dimensions, and accepts no remote image URLs or SVG. It performs one Responses API request with `store: false` and a strict bounded schema. No image/body/header/provider-error logging or disk/database persistence is performed. OpenAI's applicable retention policy still applies despite `store: false`; cancellation cannot undo data already sent or provider work already started.

The server uses a 55-second provider timeout and propagates disconnect cancellation. Errors are mapped to safe messages without revealing credentials or raw provider output. An instance permits at most two active requests and twelve interpretations per test-code hour. This in-memory limit is for a small private group; it is not a global quota across Vercel instances. Before public access, add account authorization and a durable shared rate limit. Configure OpenAI project usage controls independently.

Only the validated description, source label and local build progress are saved. Original/resized photos, access codes and the OpenAI key are not stored in project data. Images stay local in demo/manual generation unless the user explicitly selects interpretation and confirms sharing. Photo interpretation and model generation can be cancelled independently. Editing either connection field clears the saved connection and the sharing checkbox before another upload.

## Implementation and checks

- `shared/house-brief.ts`: one schema and runtime validator shared by browser and API. Bounded colors, geometry controls and notes; no part IDs or placement instructions.
- `server/handler.mjs` / `server/openai.mjs`: authenticated transport, image validation, safe errors, provider call and strict output admission. `src/pages/api/*.js` wraps the same handler for the Next.js production server and Vercel; raw request parsing and cancellation are preserved. Pages exports exclude these server-only wrappers; `npm run api` runs it locally with Node 24 and ignored `.env.local`.
- `src/domain/models.ts`: source-backed description compiler; existing demos retain their geometry and progress. Model caching includes the canonical description and is bounded.
- `src/services/providers.ts`: independent complete-assembly approval before saving. `src/services/model-thumbnail.ts` projects actual checksum-verified source triangles into bounded cached card previews, with no extra WebGL contexts.
- Tests cover the complete original demo matrix, description geometry across bounded shapes/detail/sizes, exact pace/storage consistency, hostile inputs, origin/auth/body/image limits, malformed/refused/incomplete/quota responses, and the browser consent/error/cancellation flow. Browser photo tests mock interpretation explicitly; physical and live provider testing remain separate gates.

Local API development: copy `.env.example` to ignored `.env.local`, set server secrets, include the frontend's exact origin in `BRICKMADE_ALLOWED_ORIGINS`, and run `npm run api` alongside the frontend. Only development builds permit HTTP loopback connection addresses. Use HTTPS for the hosted app.

Next: validate the real provider integration after deployment; compare real houses and correct interpretation mistakes; physically test representative generated models using [PHYSICAL_PART_TESTS.md](PHYSICAL_PART_TESTS.md). Expand footprint/roof/window capabilities only with new validated connection and whole-assembly examples.

Release verification: 467 existing automated cases plus 99 new cases (566 total), nine new browser scenarios across production Pages runs, and the nine-route Pages smoke check. Native Node 24 API startup and fail-closed configuration were checked. A server-secret canary was absent from the exported frontend. Real OpenAI/Vercel account integration and physical builds remain pending. The unified deployment passed both production builds, all 14 API tests, nine browser scenarios on the full Next.js server, five full-app HTTP route checks and seven real Next.js API/security checks using a dummy server key without calling OpenAI. All nine static Pages routes remain available; API wrappers are excluded from that export.
