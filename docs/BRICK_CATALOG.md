# Brick catalog: what the prototype uses

The prototype has no external brick database connection. `src/domain/catalog.ts` is a bundled, hand-curated catalog of 12 common shapes. A design may contain thousands of placements of those shapes; that does not mean the catalog contains thousands of unique parts.

| Part number | Shape |
| --- | --- |
| 3005 | Brick 1 × 1 |
| 3004 | Brick 1 × 2 |
| 3010 | Brick 1 × 4 |
| 3013 | Brick 1 × 6 |
| 3003 | Brick 2 × 2 |
| 3024 | Plate 1 × 1 |
| 3023 | Plate 1 × 2 |
| 3710 | Plate 1 × 4 |
| 3020 | Plate 2 × 4 |
| 3022 | Plate 2 × 2 |
| 3068b | Tile 2 × 2 |
| 3070b | Tile 1 × 1 |

Each entry defines its identifier, category, dimensions and stud layout. These shape identifiers are not color-specific orderable element/SKU codes. The eight render colors are warm sand, terracotta, smoke blue, dark brown, sage green, light gray, olive green and soft gold. These are illustrative palette names, not a verified catalog of manufactured part-and-color combinations.

The 3D viewer uses simplified bodies and studs. It does not yet model underside tubes, clutch geometry or valid connections. Tests reject overlapping bodies and check inventory/step consistency; they do not establish physical buildability, stability, stock or availability.

## Planned sources for a real design engine

- [Rebrickable](https://rebrickable.com/api/): investigate part identities, color mappings and valid combinations.
- [LDraw](https://www.ldraw.org/): investigate detailed geometry from its parts library.
- BrickLink or another sourcing provider: investigate availability later, when sourcing enters the product scope.

Check API access, licensing, attribution, update policies and usage terms before integration. No data has been downloaded from these services for the current prototype. A production importer should retain source/version information and align catalog identifiers and colors before allowing a part into the design engine.
