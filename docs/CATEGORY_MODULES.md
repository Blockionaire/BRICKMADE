# Implemented private-test category modules

Updated 2026-10-16. All five category cards feed their own schema, knowledge context, real-part construction logic and assembly checks. These are bounded photo-informed grammars; no arbitrary photogrammetry or physical certification is claimed.

| Category | Observed description and construction scope |
| --- | --- |
| House | Existing House v2: rectangular/L footprint, 1–3 storeys, four roof shapes with pitch/ridge direction, windows on four sides, door placement, garden and chimney. |
| Flower | 1–5 principal blooms, round/daisy/tulip/spike forms, bloom/center colors, stem height, leaves, single/cluster/row grouping and optional planters. Uses reviewed round stems, plant sprays and flower elements. Individual petal curvature is approximate. |
| Car | Six body silhouettes, proportions, cabin placement/height, bonnet, body/roof colors, stripe and rack. Bonded bodywork, clear cabin and curved detailing where supported. Fixed decorative wheel faces; no rolling wheels, axles, steering or opening mechanisms. |
| Animal | Cats, dogs and rabbits, sitting/standing, body proportions, head size, ears, markings and supported upright tail. Source-backed sideways eye mounts. Other species and unsupported poses are explicitly rejected. |
| Free format | 1–10 box/rounded/tapered colored components in a shared 16-unit integer workspace. Source-backed stud construction with disclosed supports. Rejects excessive support filling, essential hollow features and unsupported mechanisms. |

`shared/subject-design.ts` contains strict category contracts; `server/category-knowledge.mjs` contains versioned prompts and limitations. Unsupported subjects, mismatched categories, unknown fields, invalid dimensions and out-of-workspace components fail without substituting a demo. House retains its existing contract/artifact version; new categories use version-two immutable artifacts containing their version-one subject descriptions.

Descriptions feed a semantic scene plan and deterministic compilers. A common voxel planner packs supported rectangular pieces into bonded courses, alternating seams and using actual observed part/color pairs. Curved, plant, face and wheel details use explicitly admitted attachments. The palette now has 18 source-backed aliases. A missing special-part color may require a disclosed nearest observed color; rendered RGB never establishes marketplace availability.

Every generated result runs source/collision checksums, sampled clearance, connected support, instruction ordering/access and exact placement/inventory/bag/phase accounting. Bounded repairs keep the original interpretation and record omissions. Feature-loss checks compare against that original, so a repair cannot inflate its success by deleting requested features from its own target. Car/Free proportions are measured against actual non-foundation geometry; unassessed proportions remain null. No metric is described as image similarity.

New-category jobs require a fresh worker heartbeat advertising the appropriate capability and provider configuration. Detail variants retain original input hashes/provider provenance and reuse the interpretation without needing expired photos. Instruction pace regroups the same frozen placements; it never regenerates the design. Thumbnails, result preview, Builder and Parts use those actual placements.

Real photographs and physical builds remain the quality gates after account activation. The 117-case constructor matrix and explicit provider fixtures verify software behavior, not resemblance or real-world tolerances. Use [PHOTO_BENCHMARK.md](PHOTO_BENCHMARK.md), the Parts physical test pack, and [PHYSICAL_PART_TESTS.md](PHYSICAL_PART_TESTS.md) for those next checks.
