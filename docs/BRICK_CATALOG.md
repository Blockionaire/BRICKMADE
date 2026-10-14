# Brick catalog and geometry foundation

Updated 2026-10-14. BrickMade now imports two real sources into a downloadable SQLite database. The current part registry and geometry library retain separate identities; matching numbers are not automatically treated as matching vendor IDs.

| Source | Imported data | Snapshot |
| --- | --- | --- |
| [Rebrickable bulk catalog](https://rebrickable.com/downloads/) | **64,895 part records**, **76 categories**, **273 named colors**, **100,148 observed part/color pairs**, **114,656 element-ID records**, **37,533 part relationships** | 2026-10-13 |
| [Official LDraw Parts Library](https://library.ldraw.org/updates?latest) | **15,654 selected geometry entries**, **85 categories**, **320 render palette definitions**, **47 self-contained interactive previews** | Release 2026-09, published 2026-09-30 |

Part records include decorated variants; counts are not counts of unique molds. LDraw counts exclude aliases, assemblies, flexible sections, hidden helper shapes, unofficial files, and legacy entries without the required update header. Its upstream headline count therefore differs from our intentionally selected catalog count. Geometry dependency files are indexed separately.

The Rebrickable pair count combines positive-quantity official inventory rows and element-ID records. **Observed manufacturing/catalog evidence is not live supplier stock**, a validated connection, or proof of current availability. The importer does not download or reuse inventory photo URLs. Unknown/placeholder colors are retained as source metadata but excluded from the observed usable-pair count.

## Implemented in the app

Open **Parts → Beyond the basic brick**. Switch between **Parts & recorded colors** and **LDraw geometry**. Search names, IDs, categories, or shape features. Curated previews include curved slopes, round/hollow bricks, arches, window panes/frames, flowers, leaves, bamboo, Technic holes/gears, and wheel rims. All 47 previews contain their recursive primitives/subparts locally; no external geometry fetch is needed. Their SVG thumbnails project the same real triangle geometry.

Rebrickable entries with previews show only their recorded color choices. These are historical evidence, not a supplier availability claim. Geometry-only entries have an illustrative render palette. Explicit metadata-reviewed illustration links are in [render-links.json](../data/catalog/render-links.json); these are **not** purchase mappings or validated physical connection profiles.

The house generator uses 12 curated shapes and its original illustrative color aliases. Every house placement now renders original LDraw surfaces, including actual studs, underside cavities and tile grooves. Body heights are corrected to a uniform 8 mm scene unit: bricks are 1.2 units (9.6 mm), plates/tiles 0.4 units (3.2 mm). IDs, inventory, instruction groups and saved progress remain consistent. Broad catalog entries are not automatically enabled in generation. Connection profiles now exist for a reviewed subset; whole-model collision/insertion/stability validation and supplier IDs remain pending. The shopping exporter still refuses unresolved inputs.

Open **Beyond the basic brick → Make the connection** for a two-piece workspace with all 47 packaged shapes, 393 reviewed attachment points, snapping, arbitrary orientation support, quarter-turn controls and connector overlays. Supported rules cover male studs and reviewed underside clutch footprints, sideways headlight studs, curved slopes, plants, and the 2780 friction-pin/3700 hole pair. These are geometry-reviewed digital datums, not measured clutch-force or physical-build certifications. Generic window pegs, axle mechanisms, gear teeth and unlisted clips remain unsupported. The UI exposes partial coverage and refuses unsupported fits.

Original MPDs retain author/license headers. Binary surface meshes are compiled without simplification or nonuniform stretching, loaded lazily and checked against SHA-256 before rendering. Source outlines and connection data are in [builder-parts.json](../public/catalog/builder-parts.json); [CONNECTIONS.md](CONNECTIONS.md) explains units, scope, evidence, tolerances and reproducibility. The selected-brick inspector reports reviewed attachment points and aligned mates in the current design, with completed model audits shown separately in Review and Builder. See [ASSEMBLY_ENGINE.md](ASSEMBLY_ENGINE.md) for sampled clearance, structure and instructions.

## Permissions, attribution, and integrity

### Rebrickable

The [official downloads page](https://rebrickable.com/downloads/), read directly on 2026-10-13, states:

> You can use these files for any purpose, including commercial, provided you acknowledge Rebrickable as your source of data.

It allows automated downloads of the zipped CSV files **at most once a day**, and prohibits catalog-page scraping. The [API terms](https://rebrickable.com/terms/) also permit commercial API use, but the API requires an account/key. Bulk import needs no API key.

BrickMade uses the supported CSV downloads, attributes Rebrickable in the UI/database, retains per-file URLs, HTTP Last-Modified values, byte counts and SHA-256 records, and caches downloads for at least 24 hours. Gzip integrity was checked. No Rebrickable imagery or MOC content is copied. This permission is Rebrickable's stated download permission; it is not relabeled as a Creative Commons license.

### LDraw

The official complete archive was downloaded over verified HTTPS. Its pinned SHA-256 is `f3e496d0ede69ca7942fa4aa198e661ee2d22723906101e2e339d8917a4dd5f2`, recorded in [source.json](../data/catalog/source.json) and [manifest.json](../public/catalog/manifest.json). Future downloads must match that snapshot; an upstream change requires a reviewed source update.

Current file headers use **CC BY 4.0** or **CC BY 2.0 and CC BY 4.0**. Each record retains its actual license declaration and author. Original headers/history remain in packaged MPDs. Both legal texts and the current contributor agreement are distributed: [CAlicense4.txt](../public/catalog/CAlicense4.txt), [CAlicense.txt](../public/catalog/CAlicense.txt), and [CAreadme.txt](../public/catalog/CAreadme.txt). Dual-licensed files retain both license notices. The app credits The LDraw Parts Library and its contributors and identifies BrickMade's normalization, packaging, and projection modifications.

This official archive uses pinned archive verification, not Git-tree verification (`treeVerified: false`). The earlier exploratory GitHub snapshot was separately checked against its Git tree, then replaced by this current official release; no current claim depends on that fallback.

## Database structure and namespace boundaries

[brickmade.sqlite](../public/catalog/brickmade.sqlite) contains:

- LDraw `parts`, `identifiers`, render `colors`, source/geometry metadata, and reserved connection/purchase-mapping tables.
- Rebrickable `rb_parts`, `rb_categories`, `rb_colors`, `rb_elements`, `rb_relationships`, and `rb_part_color_observations`.
- Application `builder_parts` and `builder_connectors`, retaining explicit Rebrickable/LDraw illustration links, reviewed seating frames and evidence. These have `geometry-reviewed` status, separately from upstream verified tables.
- Source/version metadata and evidence for each imported layer.

The browser fetches a compact index for the chosen source only. The SQLite database is downloaded on request; it is not loaded into the renderer or required as a database server. Supplier mappings and the upstream verified-connection table remain empty; application geometry-reviewed profiles live in separate tables. A LEGO element ID is color-specific and may have multiple source associations; keep those records rather than inventing a unique vendor mapping.

## Reproduce / refresh

Use Python 3 and the existing Node dependencies:

```sh
cd /workspace/BRICKMADE
mkdir -p /tmp/brickmade-catalog-research
python3 scripts/catalog/import_ldraw.py --download --archive /tmp/brickmade-catalog-research/ldraw-official-current.zip
python3 scripts/catalog/import_rebrickable.py --download --input /tmp/brickmade-catalog-research
python3 scripts/catalog/package_builder.py --archive /tmp/brickmade-catalog-research/ldraw-official-current.zip
node scripts/catalog/compile_builder.mjs
node scripts/catalog/render_previews.mjs
npm test
```

**Order matters:** the LDraw importer creates the database; the Rebrickable importer enriches it; then package reviewed builder profiles, compile meshes and render thumbnails. Rerunning either source import without the builder packaging can remove or stale the application tables, so always complete the full sequence. Download caching prevents more than one automatic download per file per 24 hours. App builds never fetch upstream data automatically. Rebrickable source dates derive from the CSV HTTP Last-Modified records. Review diffs and counts before publishing a refresh. A new LDraw release needs a new reviewed `source.json`, including checksum and licensing checks; its mutable complete-archive URL is not silently accepted as the pinned snapshot.

Code and artifacts:

- [import_ldraw.py](../scripts/catalog/import_ldraw.py): official archive/license checks, database creation, and closed preview dependency packaging.
- [import_rebrickable.py](../scripts/catalog/import_rebrickable.py): bulk import, recorded color/element evidence, relationships, cache policy, and provenance.
- [render_previews.mjs](../scripts/catalog/render_previews.mjs): geometry-derived thumbnails.
- [rebrickable-manifest.json](../public/catalog/rebrickable-manifest.json): current catalog evidence and permission record.
- [manifest.json](../public/catalog/manifest.json): geometry release, selection, and integrity record.

## House profile correction

The generator uses `3005`, `3004`, `3010`, **`3009`**, `3003`, `3024`, `3023`, `3710`, `3020`, `3022`, `3068b`, and `3070b`. The old prototype mislabeled the 1×6 brick `3013`; both sources identify it as **3009**, and that is corrected. Geometry, placement IDs, piece counts, and saved progress are unchanged by the identity correction. Its colors remain illustrative. The later geometry milestone replaces simplified rendering with original surfaces and corrects vertical proportions without changing placements, inventory or saved progress.

## Required next milestones

1. Normalize reviewed mold/pattern/assembly relationships and supported building systems. Infer no cross-source identity from a shared numeric string alone.
2. Add unit-aware bounds/collision geometry, connectors, insertion clearance, and compatible studs/tubes/clips/pins/axles/articulation. LDraw surfaces do not provide a complete structural solver.
3. Admit validated parts and actual recorded colors into generation profiles gradually; curate curves, frames/panes, vegetation, and mechanical parts with physical checks.
4. Implement photo reconstruction and placement optimization for likeness, scale, supported parts, and stability. A large database is a prerequisite, not an exact-replica generator.
5. Validate step order against actual placements and test representative physical builds.
6. Resolve supplier identities and actual quantities/availability for a complete shopping handoff. See [SOURCING_PLAN.md](SOURCING_PLAN.md).
