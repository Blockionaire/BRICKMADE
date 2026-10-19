# Parts library (LDCad-connected batch)

The builder has two kinds of part:

- **Core and expansion parts** (327). These are hand-reviewed profiles with reviewed
  stud, pin and window connectors.
- **Parts-library parts** (`batch: "library"`, about 1,900). These are the most-used
  undecorated System parts. Their connectors come from the LDCad Shadow Library and
  are verified geometrically before they ship.

## Pipeline

All commands run from the repository root. The sources are the pinned LDraw archive
(its SHA-256 is in `data/catalog/source.json`) and a clone of the LDCad Shadow Library.

1. `python3 scripts/catalog/select_parts_library.py`
   - Ranks official LDraw parts whose Rebrickable identity is the same by inventory
     lot count, and freezes the shortlist in `data/catalog/parts-library-selection.json`.
   - Excluded: decorated parts, minifigures, Duplo and other non-System parts, and
     rarely used parts.
2. `python3 scripts/catalog/package_parts_library.py --archive <complete.zip> --ldcad <LDCadShadowLibrary>`
   - Writes a self-contained `.mpd` for each part to the git-ignored
     `.cache/catalog/geometry/`. These files can be rebuilt from the pinned archive.
   - Turns LDCad `SNAP_CYL` and `SNAP_CLP` metadata into connector proposals. The
     metadata is inherited through sub-files, `SNAP_INCL` grids and `SNAP_CLEAR`.
   - Plain studs and anti-studs map to the existing `stud` and `anti-stud` kinds.
   - Every other cylinder becomes `cyl-male` or `cyl-female`, with its sections
     (shape R/A/S/L, radius, length) and a slide flag. Clips become `clip`.
   - Hinge fingers (`SNAP_FGR`) and generic snaps are listed under
     `unknownMechanisms`. They are never guessed.
3. `node scripts/catalog/compile_builder.mjs --batch library`
   - Compiles the original LDraw surfaces into compact version-2 meshes: quantised,
     indexed and decoded to the same triangles. See `scripts/catalog/mesh-format.mjs`.
4. `node scripts/catalog/compile_collision.mjs --batch library`
   - Builds a 0.05-stud (0.4 mm) voxel solid from rays along X, Y and Z columns,
     united conservatively, and stores it as a run-length (version 2) `.bvox`.
   - On 33 reviewed parts it reproduces the per-cell reference method with 0.008%
     missing and 0.5% extra (conservative) cells.
5. `LIBRARY_ADMISSIONS=write SHARD=i/4 npx vitest run tests/library-admissions.test.ts`
   - Run once for each i = 0 … 3. This audits every proposal:
     - Studs and anti-studs are audited with the 3024/3005 probes at four quarter
       turns, the same as expansion parts.
     - Cylinders and clips are audited with `auditCylinderPort`. A reference shaft
       (3673 pin, 3706 axle, 87994 bar) or hole/clip (18654 beam, 12825 clip,
       73230 hollow stud) must pass the LDCad engagement rule.
     - The reference may overlap material only inside the hole's own bore.
     - It must then withdraw along the axis without hitting anything. Snap ridges
       may flex by 0.5 LDU while passing, and clips may also come off sideways.
   - Parts whose collision grid exceeds the validator limits leave the library.
6. `python3 scripts/catalog/apply_library_admissions.py`
   - Passed proposals become connectors and rejected ones become `rejectedPorts`.
   - Full audit records go to SQLite (`builder_port_audits`). The source JSON keeps
     `libraryAudit`.
7. `python3 scripts/catalog/package_builder_runtime.py`
   - Writes the packed runtime registry, which `src/domain/parts/profiles.ts` unpacks.

A normal `npx vitest run` re-audits a fixed sample of library parts and requires the
stored decisions to be reproduced exactly. It also checks that every packed profile
unpacks to the reviewed one.

## Connector rules (`src/domain/parts/connections.ts`)

A cylinder mate needs all of the following:

- One shaft (`cyl-male`) and one hole or clip.
- Coaxial axes, within 0.01 stud of each other.
- For fixed snaps: the same direction and seated start datums. Sliding snaps only
  need to overlap.
- A shaft no wider than the hole (with 0.5 LDU of slack).
- At least 3 LDU engaged at equal radius, with compatible cross-sections:
  - An axle (A) fits an axle hole or a round hole.
  - A round pin does not fit an axle hole.
  - A clip (C) grips anything except an axle.

In collision validation, the shaft may overlap only the hole's own bore.

## Licences and attribution

- **Geometry:** The LDraw Parts Library, CC BY 4.0 (some files are dual CC BY 2.0).
  Each profile names its file, author and licence.
- **Connection data:** the LDCad Shadow Library, © Roland Melkert and contributors,
  CC BY-SA 4.0, <https://github.com/RolandMelkert/LDCadShadowLibrary>.
  - The connectors derived from it are the `ldcad:` evidence entries in
    `public/catalog/builder-parts.json`, `builder-runtime.json` and the SQLite
    tables.
  - These derived connectors are shared under CC BY-SA 4.0. The commit used is
    recorded in `libraryBatch.ldcadCommit` and `library.connectionSource`.
- **Identity, colours and inventory frequency:** Rebrickable. See
  `docs/BRICK_CATALOG.md`.

The physical fit of library parts is untested (`physicalStatus: "untested"`), the
same as for every other digital audit in BrickMade.

## LDraw export

The manual page has an **LDraw file** button. It exports the generated model as an
`.ldr` file that references official parts, with a `0 STEP` after each build step,
in LDraw colour codes. LeoCAD, LDCad and BrickLink Studio can open it.
`tests/ldraw-export.test.ts` checks that every exported part lands on the builder's
own connector positions.
