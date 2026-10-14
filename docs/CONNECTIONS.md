# Accurate geometry and connection foundation

Updated 2026-10-14. Roadmap steps 1–2 introduce real surfaces and conservative local mating rules. They do not establish overall clearance, stability, manufacturability, supplier stock or a validated physical kit.

## What is implemented

- All **admitted demo shapes** use original LDraw mesh surfaces, including studs, underside details and tile grooves. Instancing keeps repeated pieces inexpensive. Selection, highlights, step grouping, animations and independent instruction difficulty remain supported.
- **327 packaged shapes** appear in the catalog and the **Connections** two-piece workspace. They include standard bricks/plates/tiles, curved and straight slopes, round pieces, arches, window frame/pane, flower/leaves/bamboo, a headlight brick, a clipped plate, Technic brick/pins/axle/gear and wheel rim.
- **1,514 supported attachment points** have geometry-reviewed frames and evidence. They cover male studs and individually reviewed underside clutch footprints, sideways studs and the **2780 friction pin ↔ 3700 round hole** fit. Standard bricks, plates and tiles have full reviewed stud-system coverage; other parts explicitly have partial or zero coverage.
- Local mating checks require complementary types, nominal dimensions, sufficient insertion depth, opposing axes, coincident seating planes and an unused connector. The 2780 split collar centre meets the 3700 hole’s exterior plane: its inner collar half occupies the 8 LDU-radius, 2 LDU-deep counterbore. The 6 LDU-radius shaft inserts 20 LDU. Collar radius/depth are checked explicitly; holes without that reviewed recess are rejected. Full-depth Technic pin insertion conservatively reserves both faces of its through-hole channel. No connector can connect a piece to itself.
- Snapping preserves a unit quaternion, supports arbitrary global rotations and translations, aligns seating frames, and allows rotation around the attachment axis. The interface offers quarter turns; this is not a collision-clearance guarantee.
- A spatially bucketed deterministic mating graph reports aligned attachments and unconnected or unsupported pieces. The house spotlight reports actual alignment counts for the design. A disconnected result does not automatically establish an error: ground-level pieces, incomplete steps and a demo assembly require separate interpretation.

The specific 60592 frame / 60601 pane fit adds two reviewed pairing datums. Upright orientation is locked, contact is restricted to the two tab regions, and manual flex fitting is explicit and physically untested. This is not a generic peg/clip rule.

## Units and coordinates

One scene unit is **8 mm**, the nominal stud pitch. One LDraw unit (LDU) is **0.4 mm**, or 1/20 scene unit. Standard brick bodies are **24 LDU = 9.6 mm = 1.2 scene units**; plates and tiles are **8 LDU = 3.2 mm = 0.4 scene units**. Stud protrusions are geometry, not extra body height.

LDraw uses downward Y; BrickMade uses right-handed upward Y. For each part, its declared `centerLdu = [cx, cy, cz]` transforms a native point `[x,y,z]` into `[(x-cx)/20, (cy-y)/20, (cz-z)/20]`. This is a 180° X rotation and **uniform** 1/20 scale followed by a datum translation. Normals receive the rotation only. Special shapes retain their original origin conventions; they are not silently recentered using a bounding box. The curved 11477 part has a negative native body datum and only its full-depth rear underside socket is reviewed.

The earlier scale correction preserved progress. The subsequent structure revision changes actual placements and migrates pre-version-5 projects with a visible progress reset and a local raw-save backup where storage permits. See [ASSEMBLY_ENGINE.md](ASSEMBLY_ENGINE.md).

The **0.002 scene unit / 0.016 mm** seating threshold and **1°** axis threshold are numerical matching limits. They are **not manufacturing tolerances** or measurements of acceptable physical play. Source meshes describe LDraw's nominal geometry, not metrology of real samples.

## Evidence and scope

The packaging script recognizes a narrow whitelist of original stud primitives (`stud`, `stud2`, `stud2a`, `stud10`) and traces their full nested transformations. It excludes scaled/skewed features and deduplicates identical frames. The latter truncated stud remains documented by its primitive reference. Underside sockets are explicit curated footprints rather than invented from mesh bounding boxes; the arch has sockets only at its end feet, never across the void. Curved/straight slopes, plant parts and Technic datums have individual rules.

Each point records its source file, primitive where applicable, method and `geometry-reviewed` status. Each part retains author, individual license, source URL, original root SHA-256, closed MPD SHA-256 and compiled mesh SHA-256. The import remains pinned to official LDraw release 2026-09. `3023` (Rebrickable) maps explicitly to `3023b` (LDraw); the script checks the original move record and never renames a purchasing identity to a geometry ID.

Important boundaries:

- A root or source catalog ID alone never generates a connector.
- Generic window peg seating, axle shapes/keying, wheel/gear mating, bar/clip clutch, hinges, flexible connections and articulation are **not implemented**. The corresponding geometry may be visible, while unsupported fits are disabled.
- Hollow studs do not automatically receive a bar connector. A visually cylindrical bore is not enough evidence for a supported joint.
- Compatibility checks operate on reviewed attachment points, **not complete solid-body interference**. In particular, a legal local mate can still cause neighboring bodies or additional studs to collide after rotation.
- Geometry alignment does not measure clutch force, solve static mechanics, certify model stability or validate assembly order.
- Roadmap steps 3–4 add complete assembly checks and four rebuilt demo families. The local workspace alone still checks only attachment alignment; complete models use the separate [assembly engine](ASSEMBLY_ENGINE.md). Physical kits remain unvalidated.
- Models now use recorded Rebrickable part/color pairs. Workspace colors remain illustrative. Historical manufacturing evidence does not establish stock.

## Artifacts and refresh

`public/catalog/builder-parts.json` is the reviewed profile and compiled-geometry manifest. `public/catalog/geometry/*.bin` stores original triangle positions/normals in a little-endian binary format (BMGE magic, version 1, vertex count, Float32 XYZ positions followed by Float32 XYZ normals). Surfaces are transformed, not remeshed or simplified; explicit linework is available in original MPDs and catalog previews, while the assembled viewer uses mesh surfaces. The renderer validates length/header/finite data and **SHA-256** before drawing. It caches CPU arrays, loads only needed shapes, and disposes GPU resources per viewer. A failed mesh shows an explicitly simplified fallback, never a successful fake-geometry indicator.

Original self-contained MPDs and geometry-derived SVGs are available under `public/catalog/previews/`. MPDs are also under `geometry/` for reproduction with the evidence manifest. Original dependency headers retain credits and license notices. Both CC BY 4.0 and applicable dual CC BY 2.0/4.0 notices remain distributed. Public UI credits the LDraw contributors and states the transforms/compilation.

Application SQLite tables `builder_parts` and `builder_connectors` contain the same reviewed profiles and source links, with foreign keys to separate source namespaces. Compilation updates the part records with final binary provenance. The upstream `connections`, `purchase_mappings` and `part_colors` verification tables remain unchanged and empty. No profile is promoted to physical certification.

After running both source imports, use this order:

```sh
python3 scripts/catalog/package_builder.py --archive /tmp/brickmade-catalog-research/ldraw-official-current.zip
node scripts/catalog/compile_builder.mjs
node scripts/catalog/render_previews.mjs
npm test
```

Packaging refuses a changed pinned archive. Rerunning packaging deliberately recreates the reviewed tables and manifest; **always compile afterwards** to restore mesh metadata. Rerun all three commands after a profile edit, then review evidence, checksums and tests. Import/compile scripts use Python's standard library and existing Three.js dependencies, no API key or new package.

## AI and later validation

Step 3 (collision, connectivity, insertion and structural heuristics) is deterministic engineering and needs no AI API. An AI API becomes useful for step 5's photo interpretation and step 6's design proposals; deterministic geometry, inventory and assembly checks must still reject impossible proposals. A future photo/API integration needs an explicit product change, server-side key handling and a user-approved upload flow. Current user photos stay local.

Physical testing of representative connections and models will be useful later. It is not a prerequisite for implementing this software foundation, and no physical test is claimed here.

The expanded library has 264 port-bearing parts and 63 geometry-only entries. New ports pass source-backed seating and approach witnesses; physical fit and strength remain untested. See [BUILDER_LIBRARY.md](BUILDER_LIBRARY.md).
