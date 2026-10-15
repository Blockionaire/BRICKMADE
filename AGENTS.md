# BrickMade working guidance

Read `docs/MASTER_PRODUCT_BRIEF.md` before making product changes. The agreed scope at the top takes precedence over future commercial examples elsewhere in the document.

- Build the private-testing experience around Compact House. Porsche 911 is a later second showcase.
- Exclude payments, prices, brick costs, ordering, and unlock gates.
- Keep demo generation and the deterministic assistant labeled as demonstrations. The description-driven house compiler and optional photo interpretation are private prototypes with explicit limits.
- Keep the model, parts, steps, bags, and assistant context consistent through the domain data.
- Preserve local-only photo handling in demo/manual generation. The category-first cloud studio uses a clearly explained Generate action as consent to upload up to three resized photos into private temporary storage and send them for AI analysis; inputs expire after 24 hours and are scheduled for automatic deletion. This newer flow is explicitly authorized by the category-first product instructions. The legacy photo-interpretation workflow under `/create/demo` may send up to three resized photos to the user's configured private API and OpenAI only after an explicit sharing checkbox. Never store photos in projects or expose the OpenAI key in the browser. See `docs/PHOTO_TO_BUILD.md`.
- Use the existing isolated checkout. Do not create a Git worktree unless the user asks.
- Validate meaningful changes with lint, typecheck, relevant tests, and the production build. For UI changes, inspect mobile behavior.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
