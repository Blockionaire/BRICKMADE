# BrickMade

A mobile-first, private-testing prototype for turning personal objects into brick builds. The first demo is a compact house with a terracotta roof, windows, a front door, a chimney, and a small garden.

## Run locally

Use Node.js 24 and npm 11 (the versions verified in this cloud environment):

```sh
cd /workspace/BRICKMADE
npm ci --cache /tmp/brickmade-npm
npm run dev
```

No credentials, environment variables, database, or external AI service are required. Fonts and illustrations are bundled locally. For a production build, use `npm run build` followed by `npm start`.

## Try the prototype

1. Choose **Create new build**, then **Use demo photos**, or select three local JPG, PNG, or WebP images.
2. Name the build and choose a detail level and size.
3. Generate the demo, rotate the house, and compare variants.
4. Explore parts by color, type, or sorting bag.
5. Enter the builder, move through the steps, and ask the Build Assistant about the current pieces, their placement, or the next step.
6. Finish the walkthrough, or resume later. Progress and build names are stored in this browser.

Every photo selection produces a predefined house variant. Photos remain in memory for that browser session and are never uploaded or persisted. Assistant responses are deterministic demonstrations, not external AI calls. No payments, pricing, cost estimates, ordering, or unlock gates are included.

The standard compact house has 342 modeled placements, 13 part/color combinations, 15 demo steps, and 4 sorting bags. Statistics, parts, bags, and instructions are calculated from the same placement data. These are digital sample instructions; physical connections, stability, stock, and part/color combinations have not been validated.

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

`npm run test:pages` checks a running static site: images, all six routes, the 3D model, parts, assistant, and progress after reload. Set `PAGES_SMOKE_URL` to its full project URL; the default is the internal test server at port 4173 under `/BRICKMADE`.

The hosted prototype requires no server, API keys, or database. Each visitor's photos stay in that browser session; build names and progress stay in that browser's local storage. Pages hosting does not add authentication.

## Project structure

- `src/app`: Home, Create, Review, Builder, Parts, and Account routes.
- `src/components`: Shared controls, model viewer, assistant, and mobile navigation.
- `src/domain`: Strict types, catalog identities, and deterministic house variants.
- `src/services`: Replaceable generation/assistant providers and local project storage.
- `tests`: Inventory/geometry consistency and browser workflow checks.

Start with the [master product and build brief](docs/MASTER_PRODUCT_BRIEF.md) for the full vision and agreed prototype scope. The compact house is the first demo; the Porsche 911 remains a future second showcase. BrickMade is independent and is not affiliated with LEGO.
