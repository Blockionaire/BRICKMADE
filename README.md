# BrickMade

A mobile-first, private-testing prototype for turning personal objects into brick builds. The first demo is a compact house with a terracotta roof, windows, a front door, a chimney, and a small garden.

## Run locally

Use Node.js 24 and npm 11 (the versions verified in this cloud environment). Catalog/database checks and imports also use Python 3 with its standard library; Python 3.12 was verified:

```sh
cd /workspace/BRICKMADE
npm ci --cache /tmp/brickmade-npm
npm run dev
```

No credentials, environment variables, database server, or external AI service are required. The imported catalog database and browser index are bundled. Fonts and illustrations are bundled locally. For a production build, use `npm run build` followed by `npm start`.

## Try the prototype

1. Choose **Create new build**, then **Use demo photos**, or select three local JPG, PNG, or WebP images.
2. Name the build, choose Easy/Normal/Hard model detail and a size, then choose Easy/Medium/Hard building difficulty independently.
3. Generate the demo, rotate the house, and compare variants.
4. Explore parts by color, type, or sorting bag.
5. Switch saved builds using visual model cards in Builder or Parts. Follow your selected instruction pace, replay each group’s placement, and use automatic or manual camera guidance. Tap a brick or a current-step part card to spotlight it, highlight visible matches, or find its exact part/color in Parts. Ask the demo assistant about the current step.
6. Finish the walkthrough, or resume later. Progress and build names are stored in this browser.

Every photo selection produces a predefined house variant. Photos remain in memory for that browser session and are never uploaded or persisted. Assistant responses are deterministic demonstrations, not external AI calls. No payments, pricing, cost estimates, ordering, or unlock gates are included.

The Normal compact house has 342 modeled placements, 13 part/color combinations, small guided steps, and 4 sorting bags. Statistics, parts, bags, and instructions are calculated from the same placement data. These are digital sample instructions; physical connections, stability, stock, and part/color combinations have not been validated.

Easy uses larger wall bricks, broad roof plates, lower walls, and minimal landscaping. Normal adds a chimney and fuller windows and garden. Hard uses smaller pieces and taller windows with crossbars, shutters, a porch canopy, a ridge skylight, and a rear garden fence. The saved-build thumbnails project actual model placements rather than a generic illustration. Builder counts report the actual visible pieces at each step and the full design total.

Existing version-1 browser saves migrate to the three modes (Standard → Normal; High Detail/Collector → Hard). Names and selected sizes are preserved; progress restarts because the designs and their instructions changed.

## Build studio

Building difficulty controls the instructions independently of model detail. Easy uses groups of at most 6 pieces; Medium uses groups of at most 16. Both stay on one elevation and wall face. Hard builds whole horizontal layers, combining all wall faces at the same height, within each construction section and sorting bag. Each step has its exact parts list, focus point and suggested camera angle. The model geometry, piece count and inventories remain unchanged. Choose the pace in Create, Preview, or Builder; cards show the actual step counts.

Placement guide animates the current group down into its actual destination outlines. Replay and Assembled controls let users repeat or skip the motion. Camera transitions stop when users start dragging; automatic camera guidance can be turned off. Reduced-motion preferences skip the animations and show the settled model immediately. Rendering runs on demand between short interactions.

The spotlight highlights one placement or all visible placements with the same part/color, showing both the visible and full-build matching counts. Find in parts opens the matching part/color filter. Build selection uses model cards; parts filters use category chips and color swatches.

Version-2 saves map their old construction phases into the selected instructions. Version-3 saves migrate from the original 6/8/10-piece boundaries to version 4 using the exact completed placement IDs. Switching difficulty preserves those IDs and resumes at the first group containing unbuilt pieces; a partially completed larger group may repeat. Switching back without advancing returns to the original place. Completed builds remain complete, and each saved build retains its own pace.

The house uses 12 curated shapes. The separate library imports **64,895 Rebrickable part records**, **100,148 observed part/color pairs**, **114,656 element-ID records**, and **15,654 selected official LDraw geometry entries**. Open **Parts → Beyond the basic brick** to search the two source namespaces and inspect 15 real geometry previews. Rebrickable data is current to 2026-10-13; LDraw is official release 2026-09. The SQLite download retains provenance and reserved connection/vendor-mapping tables. Historical colors are not live stock, and new parts are not automatically enabled in generation. See [BRICK_CATALOG.md](docs/BRICK_CATALOG.md) for permissions and import commands, and [SOURCING_PLAN.md](docs/SOURCING_PLAN.md) for the complete-list buying architecture.


## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Browser tests use the system Chromium at `/usr/bin/chromium`. Set `CHROMIUM_PATH` to another Chromium executable if needed. Playwright starts a development server automatically if one is not already running. Tests cover creation, cancellation, local image selection, model controls, filters, progress persistence, assistant context, completion, renaming, reset, and screen widths of 320, 390, and 1440 pixels.

## GitHub Pages

The Pages workflow builds a static export and publishes it when `main` changes. Set the repository's **Settings → Pages → Source** to **GitHub Actions**. The intended project address is `https://blockionaire.github.io/BRICKMADE/`.

For a local Pages build:

```sh
npm run build:pages
```

This writes the deployable site to `out/`, including every page, bundled fonts, and demo illustrations. Pages builds use the `/BRICKMADE` prefix and directory URLs so direct links and reloads work. The GitHub workflow takes the prefix from the Pages configuration, allowing a custom domain later. Normal development and production-server commands retain their original behavior.

`npm run test:pages` checks a running static site: images, all seven routes, the 3D model, parts, assistant, and progress after reload. Set `PAGES_SMOKE_URL` to its full project URL; the default is the internal test server at port 4173 under `/BRICKMADE`.

The hosted prototype requires no server, API keys, or database. Each visitor's photos stay in that browser session; build names and progress stay in that browser's local storage. Pages hosting does not add authentication.

## Project structure

- `src/app`: Home, Create, Review, Builder, Parts, and Account routes.
- `src/components`: Shared controls, model viewer, assistant, and mobile navigation.
- `src/domain`: Strict types, catalog identities, and deterministic house variants.
- `src/services`: Replaceable generation/assistant providers and local project storage.
- `tests`: Inventory/geometry consistency and browser workflow checks.

Start with the [master product and build brief](docs/MASTER_PRODUCT_BRIEF.md) for the full vision and agreed prototype scope. The compact house is the first demo; the Porsche 911 remains a future second showcase. BrickMade is independent and is not affiliated with LEGO.
