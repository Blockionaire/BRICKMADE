# Assembly and instruction foundation

Updated 2026-10-14. Roadmap steps 3 and 4 are implemented as a deterministic, digitally checked prototype. No AI API is needed for these stages. Physical builds and a broader connection library remain necessary before offering kits.

## Source of truth

The broad source library remains 64,895 Rebrickable records and 15,654 selected LDraw entries. It is distinct from the **327 packaged builder entries / 1,514 supported attachment points**. A catalog search result is never automatically allowed into a generated assembly. `builder-parts.json` and its SQLite `builder_parts.profile_json` entries hold original-source provenance, surfaces, recorded Rebrickable color IDs, reviewed connector frames and collision evidence. Purchasing IDs remain in their own namespaces.

`src/domain/models.ts` creates the actual placements for Compact House, Little Rover, Bloom Pot and Garden Pavilion. Each has three detail levels and three sizes. Instruction difficulty changes grouping, not the geometry. Parts, steps, bags, counts, highlights, thumbnails and the assistant derive from these placements. House dimensions use the original surfaces at 8 mm per scene unit.

The rebuilt house has a two-course foundation whose staggered upper plates connect all lower plates. Alternating wall corners and long joints establish connections between courses. Hard mode adds bonding courses, reviewed side-stud shutters and more windows. All wall studs stay exposed; no wall is seated on a smooth floor tile. Roof strips attach to both wall edges. The compact house counts are Easy 84, Normal 126, Hard 243; the reduction from the old scene removes unsupported decorative fragments and uses a coherent base.

The rover uses **fixed decorative wheel faces**, not rolling wheels. The plant uses actual leaf, bamboo and flower geometry with supported stems. Pavilion arches attach at their end feet; its staggered arch elevations prevent intersecting corner feet.

## Six audit groups

1. **Parts and colors:** known reviewed profiles, finite coordinates and unit rotations, valid instruction references, and recorded part/color evidence from Rebrickable. Historic production evidence does not establish current stock.
2. **Structure:** complementary seating datums form a graph. All pieces must have a path to a foundation touching the display surface, and the finished design must be one connected component. Below-ground geometry fails. Connector competition is resolved deterministically; two pieces cannot own the same socket or reserved pin channel.
3. **Instructions:** every piece appears exactly once. The displayed order, including order within a large step, must attach each new piece to an existing anchor and satisfy explicit dependencies. Manual window fitting needs an explicit procedure. Geometry is not silently reordered to make a bad sequence pass.
4. **Inventory:** complete part/color totals, every step inventory, contiguous bag ranges and bag inventories must agree with the placements and statistics.
5. **Geometry:** actual sampled material, including hollow undersides, determines interference. Bounding envelopes only find candidates. An approved fit only permits contact within its reviewed stud/pin mating volume or the two explicit frame/pane tab regions. A connected pair gets no blanket collision exemption.
6. **Placement access:** every rigid piece is swept outward from its seated position along its declared cardinal approach axis until clear of earlier geometry. The audit includes earlier pieces in the same instruction step. Any sampled interference fails. This checks a specified straight path; it does not search arbitrary curved insertion paths or simulate hands/tools.

`src/domain/validation/assembly.ts` implements the audit. Browsers load checksum-checked evidence lazily and run it in a worker. Generation and the demo collection require a completed passing report before saving a new project. Review and Builder show the current report, its checks and limitations. Reports are cached against the complete model, instruction and profile signature; a changed design cannot inherit an old pass.

## Finite-resolution solver and physical limits

Collision artifacts sample source mesh interiors on a **0.05 scene-unit / 0.4 mm grid**. LDraw contains open surfaces, duplicated triangles and touching internal components, so naive bounding boxes or odd/even ray counting are insufficient. The compiler uses nearest oriented boundaries, cancellation of coincident opposite faces, and two independent ray directions. Disputed samples are conservatively occupied and counted in the manifest. Samples outside the actual source bounds are excluded. SHA-256 connects each artifact to its source mesh.

Only cardinal rotations and positions aligned to this grid receive a geometry pass. Unsupported poses fail rather than becoming substitute boxes. Features or clearance below 0.4 mm can be missed. The conservative union can also produce false collisions. Nominal source meshes and recorded connector datums are not metrology.

A connected foundation is **not proof of mechanical strength or static stability**. The audit reports broad parts with limited neighboring anchors and a sampled-volume-center warning when outside the ground bounding footprint. These are screening heuristics, not measured mass, a support-polygon analysis, clutch-force calculation, load bearing, a friction model or a force simulation. Every report explicitly remains `physicalStatus: untested`.

The specific **60592 frame / 60601 pane** pairing has a shared datum, opposing normals and a locked upright orientation. Only its documented tab regions permit contact. It requires manual flex fitting, so a rigid straight-path audit is inapplicable and disclosed. This pair needs a physical installation test. It establishes no generic window-peg, clip or flexible-part rule.

Axles, wheel hubs, gear teeth, bar/clip mechanisms, hinges and other unlisted attachments remain unsupported. A model using an entirely unreviewed mechanism fails. Further mechanical connections should be admitted only with explicit source geometry, collision fixtures and physical examples.

## Reproduce and verify

Run the pinned source packaging and surface compilation described in [CONNECTIONS.md](CONNECTIONS.md), then:

```sh
node scripts/catalog/compile_collision.mjs
EXPORT_DEMO_MODELS=/tmp/brickmade-models.json npm test
python3 -m pip install -r scripts/catalog/requirements-previews.txt
python3 scripts/catalog/build_model_previews.py /tmp/brickmade-models.json
npm run lint
npm run typecheck
npm run build:pages
```

The preview compiler requires Pillow and renders source triangles from the exact validated placements. It generates 36 saved-card PNGs rather than invented artwork or proxy boxes. Preview geometry is independent of instruction pace. Preview panes are drawn as opaque colored surfaces; the interactive viewer renders transparent parts with their selected alpha.

The suite audits **108 complete combinations** (four families × three detail levels × three sizes × three instruction paces). Adversarial fixtures cover the obsolete floating house, hollow seating, competing sockets, solid containment/interference, smooth tile supports, reversed order, obstructed insertion including within one step and for late foundation pieces, missing parts/inventory/bags, absent color evidence, invalid transforms, unsupported poses and absent manual fitting instructions. Mesh and collision checksums are checked independently. Browser tests exercise creation, collection selection, rotations, picking, replay, pace switching, migration, parts filtering, mobile layout and the static Pages base path.

## Existing saves

Storage format is version 5. Older projects keep names and settings, but reset obsolete progress because the physical layout and piece identities have changed. Where browser storage permits, the original raw save is retained under `brickmade.private-demo.v1.before-structure-v2`. A visible update notice explains this migration. Pace changes within version 5 retain exact completed pieces.

## Next engineering gates

Physically build representative variants, record fit and support failures, then expand reviewed connections and compound subassemblies. Add measured mass/clutch evidence before claiming strength. A later photo-understanding model may propose a shape; it must choose reviewed parts and pass these independent checks. AI output itself cannot certify an assembly. Purchasing handoff additionally requires verified provider IDs and current availability, as described in [SOURCING_PLAN.md](SOURCING_PLAN.md).

Release verification: 179 domain/source/engineering tests pass, including 108 complete model audits. Browser checks cover all 22 scenarios across the regression runs, including refusal to create a project from tampered collision data and visible manual window instructions. A production Pages smoke check verifies all nine routes, the validation worker, real meshes, source library, transparent glass, saved progress and instruction pace with no browser errors or failed requests.

The expanded library has 264 port-bearing parts and 63 geometry-only entries. New ports pass source-backed seating and approach witnesses; physical fit and strength remain untested. See [BUILDER_LIBRARY.md](BUILDER_LIBRARY.md).
