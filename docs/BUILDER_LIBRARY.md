# Expanded builder library

Updated 2026-10-14. This is a nominal-geometry building library for the private prototype. Photos remain local and no AI, prices, payments or ordering are introduced.

## Current scope

The builder packages **327 part entries**, up from 47: **264 have supported connection points** and **63 are geometry-only**. The expansion adds 280 entries across nine families. Of these additions, **221 have geometry-tested ports**; 59 remain available for geometry exploration with mating rules pending. The original 47 profiles and their 393 reviewed points remain unchanged.

There are **1,514 supported attachment points** in total. The 1,121 new points passed **8,968 reference placement witnesses**: a 1×1 plate (3024) and 1×1 brick (3005), each at four quarter turns. Eight proposed points failed and were removed from active connections. Their original evidence and failure reasons remain in `rejectedPorts` and `portAudit`.

The selection is 45 bricks, 55 plates, 28 tiles, 65 slopes, 18 arches, 12 windows, 18 panels, 14 plants and 25 wedges in addition to the core 47. These counts include distinct mould variants, not decorated/color duplicates. The broader catalogs remain 64,895 Rebrickable records and 15,654 selected LDraw entries.

A supported point does **not** establish full connection coverage for a part. Some entries only receive pieces on exposed studs; others mount through reviewed underside ports; some do both. Glass panes, bars, clips, hinges, axles, gear teeth and unlisted mechanisms remain unsupported except for the original specifically reviewed pin and window pairs. The interactive library labels the limits explicitly. Physical fit and strength remain untested throughout.

## Source and admission rules

`data/catalog/builder-expansion.json` freezes the exact selection, both source names, identity/footprint evidence, category and historical inventory frequency. Candidates come from the pinned official LDraw archive and existing Rebrickable snapshot. Decorated parts, stickers, assemblies, non-System scales and electrical/magnetic parts are excluded. Seventy links with disagreeing source dimensions were withheld. Matching numeric IDs alone are insufficient for selection, and illustration links never become supplier buying IDs.

Original, closed MPDs, exact uniformly scaled triangle meshes, sampled collision artifacts, source authors, licenses, checksums, recorded colors and native datums are packaged for every entry. New complex parts retain their native origin; their bounding dimensions are display/envelope information, not rectangular collision substitutes. Standard rectangular families use established body datums and grid footprints, then each proposed port is tested against actual surfaces.

Source stud references are traced through the complete nested transform. Only the known standard primitives and supported cardinal frames are eligible. Scaled/skewed studs are rejected. Open `stud4` / `stud4a` tubes have an explicit 6 LDU inner radius. Their mouth is transformed from primitive local Y=-4; radial scaling and sufficient tube depth are checked. A source cavity or similar bounding box alone creates no connector.

Qualification tests both reference parts at four quarter turns. Seating and the declared straight approach must clear actual sampled material. Only a narrow outer contact band permits nominal sampling interference; the inner bore must stay empty. A solid or blocked cylinder cannot pass through a blanket contact exemption. Unsupported poses, obstructed approaches and failed port proposals remain rejected. Sampling is 0.4 mm, with conservative treatment of disputed source cells; sub-resolution features and measured clutch forces are outside this proof.

Some candidate parts have no eligible reference primitive, despite obviously useful real-world connections. They are held as geometry-only rather than assigned guessed mechanisms. Known limits are actionable backlog items, not deleted source records.

## Building knowledge and matching

`src/domain/parts/selection.ts` selects by recorded Rebrickable color, category, actual envelope and capability: mount, receive, or stack. Candidate and geometry-only entries are excluded from supported searches. Nominal alternatives are limited to complete rectangular stud-system parts with identical body sizes and full attachment signatures. A smooth tile never substitutes for a studded plate. Every replacement still requires whole-assembly validation.

`src/domain/parts/building-patterns.ts` supplies five actual-placement examples: a bonded wall, an arch cap, side detailing, a mounted plant and a curved surface. Their inventory, steps, dependencies and dimensions derive from the geometry, and each passes the full assembly engine. This is a growing reusable pattern library, not a claim that arbitrary kits are physically proven.

The Connections chooser has searchable, paged cards, category chips and a supported-ports filter. Examples exercise wider bricks, longer tiles, arches, new foliage and curved slopes. The operational registry omits bulky audit histories; full evidence remains in JSON and SQLite. Catalog previews load in bounded pages, and compiled meshes load only when selected. Explicit fixed LDraw colors are retained in standalone previews; source color namespaces remain separate from purchasing colors. Existing house/rover/plant/pavilion layouts and saved progress do not change.

## Reproduce

Use Node 24, npm's frozen lockfile, Python 3 and the existing pinned archive. No new runtime package or API key is needed. Verify archive checksums; never bypass TLS or change the pinned digest to accept a newer archive.

```sh
python3 scripts/catalog/select_builder_expansion.py
python3 scripts/catalog/package_builder.py --archive /tmp/brickmade-catalog-research/ldraw-official-current.zip
node scripts/catalog/compile_builder.mjs
node scripts/catalog/compile_collision.mjs
python3 scripts/catalog/package_builder_runtime.py
WRITE_BUILDER_ADMISSIONS=1 npm test -- tests/builder-admissions.test.ts
python3 scripts/catalog/embed_preview_palette.py
node scripts/catalog/render_previews.mjs
python3 scripts/catalog/package_builder_runtime.py
npm test
npm run lint
npm run typecheck
npm run build:pages
```

Packaging resets expansion candidates to their source proposals. Qualify them before publishing. Collision caching checks both the current mesh checksum and collision artifact checksum; changed geometry is recomputed. Qualification writes exact final profiles to JSON and SQLite and removes failed active connectors. Tests independently check source namespaces, foreign keys, artifact checksums, port witnesses, rejected proposals, all 108 existing design/size/detail/pace variants, and the reusable patterns. Test concurrency is bounded for the larger source library.

## Next physical gate

See [PHYSICAL_PART_TESTS.md](PHYSICAL_PART_TESTS.md) for the first representative tests. Physical results should be stored separately from nominal geometry evidence; a digital pass must never silently become physical certification. A later AI proposal must select supported capabilities and pass the full assembly engine before it can be offered as instructions.

Release checks: 467 automated tests pass, including all 108 existing complete model variants, 280 expanded-part qualification cases, retained rejected-port checks, the runtime projection and five reusable assembly patterns. All 24 browser scenarios passed across regression runs, including expanded filtering, exact article lookup, unsupported-pane refusal, new examples, real picking, animations, saved progress, source browsing and mobile layouts.
