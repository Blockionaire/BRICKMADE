# BrickMade working guidance

Read `docs/MASTER_PRODUCT_BRIEF.md` before making product changes. The agreed scope at the top takes precedence over future commercial examples elsewhere in the document.

- Build the private-testing experience around Compact House. Porsche 911 is a later second showcase.
- Exclude payments, prices, brick costs, ordering, and unlock gates.
- Keep generation and assistant functionality clearly identified as demonstrations.
- Keep the model, parts, steps, bags, and assistant context consistent through the domain data.
- Preserve local-only photo handling; never upload user photos without an explicit product change.
- Use the existing isolated checkout. Do not create a Git worktree unless the user asks.
- Validate meaningful changes with lint, typecheck, relevant tests, and the production build. For UI changes, inspect mobile behavior.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
