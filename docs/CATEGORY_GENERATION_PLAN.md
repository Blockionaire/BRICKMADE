# Category-first photo-to-brick generation

**Implementation update, 2026-10-15:** the six implementation steps are now present in the repository, with House as the first enabled category. The working infrastructure uses Vercel + Supabase Postgres/Auth/Storage + a portable Node 24 worker; Trigger.dev and Realtime are not required. See [CLOUD_STUDIO_SETUP.md](CLOUD_STUDIO_SETUP.md) for actual routes and activation, and [RELEASE_LOG.md](RELEASE_LOG.md) for verified results. The original proposal below is retained as planning history. Hosted activation and real OpenAI testing require the owner’s project/worker secrets.

Proposed architecture, 2026-10-15. This is a build plan, not an implemented or deployed capability. It replaces the intended creation flow; existing saved builds, the interactive viewer, parts and progress remain valuable foundations. No customer payments, brick pricing or ordering enter this milestone.

## Product flow

1. Choose **House, Car, Animal, Flower, or Free format** using large visual cards.
2. Choose one to three photos. Explain briefly that generation sends resized images to BrickMade and its AI provider. Show immediate local checks for corrupt images, poor framing and resolution. Offer additional angles without making them mandatory. Default to a compact, Normal-detail model and Medium instruction pace; allow an optional detail choice here.
3. Press **Generate my build**. This is the clear submission action authorizing photo processing. No separate service connection, access token, prompt writing or mandatory description editor. Preserve the existing explicit sharing control until an equivalent clear submission flow is implemented and tested.
4. See real generation stages and an actual candidate brick preview when available. Do not substitute an illustration or a generic demo for the submitted object. Reopening the page resumes the job.
5. Receive the checked model, its parts and instructions. Offer **Simpler / More detail**, **Building pace** and optional **Adjust design** controls. The first usable result must not require additional editing or approval steps.

Ask at most one specific question when an ambiguity prevents a useful result, such as two unrelated objects in one image. Otherwise make conservative assumptions, expose significant compromises unobtrusively, and let users refine after seeing a result. Unseen geometry and real dimensions cannot be recovered exactly from arbitrary photos. A more detailed model is not automatically more accurate.

Model detail changes geometry and requires a new checked design revision. Instruction pace changes grouping of the same placements. Retain completed piece IDs when regrouping instructions; confirm before replacing a design with recorded progress. Size can default automatically and remain an optional later control.

## What exists and what is missing

The current photo API returns a narrow HouseBrief. It rejects other subjects and complex houses. The browser then runs a bounded house compiler. Adding category buttons or longer prompts cannot turn this into general object reconstruction. The reported live failure is at https://brickmade.vercel.app, specifically the Interpret my photos action after successful connection and upload. This execution environment cannot reach that URL because its egress gateway denies the domain. A local regression reproduced offscreen failure notices; code inspection also showed that same-origin GET status checks could omit Origin while photo POSTs include it, allowing a connection check to miss a configured-origin mismatch. These diagnostics issues are addressed separately; the exact cause of the reported live interpretation failure remains unconfirmed.

Retain the source-backed catalog, licensed meshes, admitted connection profiles, assembly checks, actual-placement rendering, inventories and instruction regrouping. The broad catalog has 64,895 Rebrickable records; the packaged generator library has 327 entries, including 63 geometry-only entries. Catalog presence does not establish usable connections, physical strength or supplier availability.

The existing Little Rover has decorative fixed wheel faces. It is not a photo-derived car generator or a validated rolling chassis. Bloom Pot is a useful starting example, not a general botanical generator. Animal generation and general free-format generation do not exist yet.

## Category modules

Each versioned module contains recognition guidance, a strict subject schema, feature priorities, supported construction patterns, allowed part capabilities, geometric constraints, example designs, an evaluator and regression fixtures. Prompt/schema/planner versions and the selected examples are recorded with every job. Deploying another category requires its generation and validation implementation as well as its context.

| Module | What interpretation should preserve | Engineering work |
| --- | --- | --- |
| House | Footprint, wings, roof form, storeys, openings, facade rhythm, dominant colors | Foundations, wall bonding, openings, roof support and independently assembled sections; gradually expand beyond rectangular footprints |
| Car | Body proportions, wheelbase, wheel locations, cabin, hood, roofline and recognizable details | Admit real compatible wheel/axle pairs, create a checked chassis and body attachment patterns; validate rolling behavior physically before promising it |
| Animal | Silhouette, pose, body/head proportions, legs, ears, tail and markings | Supported organic volumes, neck/limb attachments and a conservative support base where needed; poses and balance need physical testing |
| Flower | Bloom shape, petal arrangement, stem, leaves and pot/support where present | Review actual flower/stem interfaces, petal assemblies, stem reinforcement and balance |
| Free format | Main subject, its components, proportions and distinguishing features | Compose supported patterns or a conservative stud-based sculpture; retain identical part, geometry and structural restrictions |

Free format gives interpretation and composition more latitude. It does not grant permission to invent parts, connections or unsupported mechanisms. A generic silhouette pipeline must be developed and evaluated; routing an arbitrary object to a house template is not acceptable. If a subject is outside admitted capabilities, explain the limitation or offer a clearly labeled, genuinely derived simplification.

The AI receives a compact common rule set plus the selected category module and relevant examples. Retrieve patterns and parts using capabilities, dimensions, geometry and recorded colors. Do not put the entire brick database or every instruction document into the model context. Use source-owned or appropriately licensed reference builds and preserve provenance.

## Generation pipeline

1. **Validate and prepare input.** Decode and re-encode images, remove metadata, cap count/bytes/pixels, check ownership, and establish a shared analysis across views. Local quality hints do not claim to establish recognition accuracy.
2. **Interpret subject.** A vision model returns a versioned category-specific description with observed features, approximate proportions, uncertainty and view evidence. Reject malformed output. If the selected category conflicts with the subject, request a category correction or offer a clearly explained route change.
3. **Plan shape and subassemblies.** Produce a semantic scene graph of masses, surfaces, color regions, attachments and feature priorities. This intermediate representation is richer than the present HouseBrief and is not yet a brick model. Start with procedural category patterns and bounded surface/volume approximations; avoid pretending a prompt reconstructs exact hidden 3D geometry.
4. **Compile real placements.** Deterministic planners choose admitted patterns, real pieces, recorded colors, positions and orientations, balancing silhouette, distinctive features, piece count and connection feasibility. The AI may propose a bounded plan; it cannot self-certify coordinates or structure.
5. **Validate and repair.** Run identity/color, connection, collision, support, placement access and instruction dependency checks. Return structured failures to a bounded repair loop. Initially allow at most two repairs with per-job time/token limits. Repair affected subassemblies and reuse successful interpretation. Unsupported or invalid output never silently becomes a demo.
6. **Evaluate resemblance.** Render actual candidate placements from reference views. Compare silhouette, proportions, feature locations and colors. Use this separately from engineering checks; an AI image comparison cannot certify connections or strength. Pick the best candidate meeting the minimum technical and resemblance gates.
7. **Finalize.** Derive the complete BOM, bags, ordered instructions, counts and thumbnails from the exact same immutable placements. Save the final artifact and validation report. The browser renders this artifact, rather than regenerating a potentially different design from settings.

Early previews are marked as candidates while checks are pending. A build becomes usable only after the required checks pass. Digital checks retain their finite-resolution limits and `physicalStatus: untested` until real assembly evidence exists. Future strength/stability work requires measured connections and more complete mechanical analysis.

## Recommended infrastructure

Use the existing Vercel and Supabase accounts, and add Trigger.dev as the proposed durable job runner. Verify its current runtime, resource, retention and regional options during the worker spike; this plan does not assume untested provider limits. All three are infrastructure services, separate from the OpenAI API account.

| Component | Responsibility |
| --- | --- |
| Vercel / Next.js | App, authenticated intake, signed upload tickets, job submission/status/cancellation and serving artifact access; never hold generation inside one browser HTTP request |
| Supabase Auth | Anonymous private-test sessions initially, with an optional account upgrade; the app handles identity without asking for API configuration |
| Supabase Postgres | Projects, jobs, design revisions, category versions, asset metadata, progress, evaluation results and durable per-user generation limits |
| Supabase Storage | Separate private input-photo and generated-artifact buckets; versioned public/licensed geometry assets can use a separate cacheable bucket |
| Trigger.dev worker | Durable stage execution, concurrency limits, cancellation, checkpoints, bounded retries, compilation, evaluation and finalization |
| OpenAI Responses API | Photo interpretation and narrowly scoped planning/repair/evaluation when needed; server-side credentials and strict validated outputs |

The worker is Node.js 24 and reuses the geometry/domain code after separating browser asset loading from shared logic. Load only the pinned part profiles and geometry needed for the job. Start with CPU rendering of actual source meshes where sufficient; benchmark candidate generation and collision validation before choosing worker memory/concurrency. If the benchmark exceeds the runner's supported resources, move the heavy stage to a container compute worker while keeping the same job and artifact contract.

Initial deployment keeps frontend and API on one Vercel origin. Users never enter a Vercel address or shared test code. API requests verify Supabase user sessions; database and storage policies limit every project, job and private object to its owner. Service-role, worker and OpenAI keys stay on servers. Workers receive a job ID and read validated inputs server-side; photos and secrets do not enter queue arguments or logs.

Proposed routes:

- `GET /api/categories`: category capabilities/readiness and versioned detail options.
- `POST /api/builds`: create an owned draft and scoped upload tickets.
- `POST /api/builds/:id/generate`: finalize inputs and enqueue an idempotent job; return promptly with its ID.
- `GET /api/jobs/:id`: stage, progress, safe errors and result artifact reference; Supabase Realtime can push updates with polling fallback.
- `POST /api/jobs/:id/cancel`: request cancellation at stage boundaries and abort active provider work where possible.
- `POST /api/builds/:id/variants`: create a detail/size revision using the existing interpretation; regrouping instruction pace does not trigger another photo analysis.

Proposed tables: `projects`, `build_jobs`, `job_events`, `job_outbox`, `source_assets`, `design_revisions`, `build_progress`, `category_versions`, `catalog_versions`, `part_profiles`, `building_patterns`, `evaluation_runs`. Keep catalog snapshots and geometry versioned; the existing SQLite snapshot can seed metadata, and workers can cache its immutable files. Start reference retrieval with category, capability, size and color filters in Postgres; add embeddings only if benchmarked retrieval requires them. Final artifacts include their schema version, placements, part/color identities, dependencies, approaches, instructions, BOM and immutable validation references. Record image/brief hashes, model configuration, compiler/category/catalog versions and artifact checksums for reproducibility. Do not record image content or raw provider errors in diagnostic events.

Use an owner-scoped idempotency key for submissions. Insert the pending job and outbox event atomically; enqueue with job ID as the deduplication key. A scheduled server-side outbox dispatcher recovers missed dispatches. Work is at-least-once: stage transitions and artifact publication must be idempotent. Checkpoint completed AI responses; ambiguous provider timeouts cannot guarantee exactly-once billing and must not trigger blind unlimited retries. Supabase Cron plus a small authenticated dispatcher is the proposed recovery path, to be verified in the infrastructure spike.

Store input photos only temporarily in private storage for queued processing. Proposed default: automatic deletion within 24 hours, with a recurring cleanup job, after retries no longer need them. Say this before submission. This changes today's memory-only handling and must ship with tested privacy behavior. Retaining references for later regeneration is an explicit optional choice. Cancellation cannot retract data already sent to a provider. Persist the validated description so most variants need no photos or additional vision call.

## Quality and speed

Maintain a category benchmark of user-owned/licensed examples with varied shapes, colors, lighting, occlusion and difficulty, including unsupported subjects. Start with at least 20 representative cases for a category; add hard failures as fixtures. Measure recognition, feature fidelity, actual-geometry resemblance, digital assembly pass rate, repair frequency, latency, instructions and physical build results separately. Do not report a single visual similarity score as proof of buildability.

Keep provider/model settings configurable by role. The present `gpt-5.2` integration is the baseline for evaluation, not a verified claim about the strongest currently available model. Compare compatible vision/structured-output models and reasoning effort on the same cases. Start with one strong interpretation call and deterministic construction; add extra AI calls only where measured outcomes justify them.

Get speed from selective retrieval, shared geometry caches, concurrent independent work, sensible model size limits, durable progress, reusing interpretation and targeted repair. Exact latency and worker cost targets follow the first benchmark; do not promise a generation time before measuring it. Return the first validated design, then compute requested variants without making users restart. Cancel superseded queued variants.

## Implementation order and release gates

1. **Diagnose the reported live failure.** Establish URL/deployed revision and distinguish authentication, origin, provider, timeout and assembly failures. Add safe per-stage trace IDs and error events. Preserve any useful failing test photo only with permission.
2. **Ship the category-first creation shell.** Automatic defaults, image input, clear submission and resumable result screen. Define all five category slots; only enable a category for generation when its actual adapter passes the release gate. Keep unavailable work clearly marked rather than faking support.
3. **Add Supabase identity, private uploads and project persistence.** Implement policies, temporary image deletion and anonymous-to-account upgrade. Offer an explicit browser-local project import so current users do not lose access to old saves across origins.
4. **Add durable jobs and worker execution.** Validate actual enqueue/restart/cancel/retry recovery, outbox delivery, shared limits and server-side secrets with one real end-to-end provider call.
5. **Implement category contracts and a richer shared design representation.** Introduce versioned schemas, reference retrieval, artifact contracts and adapters around the reusable compiler/validation code.
6. **Make House the first complete category.** Expand footprint/roof/opening/subassembly patterns and compare real photos against the old compiler. Gate launch on meaningful improvement in resemblance and checked output. Do not declare success merely because the same house is produced from different photos.
7. **Add Flower.** Reuse existing plant examples but implement photo-derived bloom/stem/leaf variation and needed supported connections.
8. **Add Car.** Build and physically test chassis/wheel/axle patterns, then add recognizable body generation. The old decorative rover is not the acceptance criterion.
9. **Add Animal.** Introduce supported organic assemblies, characteristic head/limb patterns, pose constraints and balance evaluation with physical samples.
10. **Add Free format and run the combined benchmark.** Compose available category patterns and the new generic sculpture planner, then test unsupported subjects, varied devices, partial network failures, concurrent jobs and real assembly examples. Make detail revisions and instruction pace behave consistently across categories.

There is no evidence-based calendar estimate yet. Measure the worker and first expanded House slice before estimating later categories. The first useful delivery is one genuine category-to-photos-to-checked-build flow; subsequent modules extend that same architecture. Private testing remains distinct from a public release with demonstrated reliability and physical build evidence.
