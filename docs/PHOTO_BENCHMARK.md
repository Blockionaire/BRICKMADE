# Repeatable private photo benchmark

Run this on a trusted computer with `npm ci` and Node 24. Keep the dataset in the ignored `private-benchmarks/` folder. Supply your own photos or appropriately licensed photos, with permission to send them to OpenAI. No benchmark photos have been supplied or sent in this development session.

Example `private-benchmarks/cases.json`:

```json
{"version":1,"cases":[{"id":"house-front-01","category":"house","consent":true,"rights":"owned","source":"My own house photos, approved for private testing","photos":["house-front.jpg","house-side.jpg"],"options":{"detail":"normal","size":"standard","pace":"medium"},"expected":{"storeys":2,"roofShape":"gable","chimney":true}}]}
```

Use anonymous case IDs; keep names and addresses out of expected fields. Every case requires 1–3 local JPEG/PNG/WebP photos, explicit consent, source information, rights and expected observable description fields. The tool checks the whole dataset before any provider request, strips metadata and re-encodes bounded JPEGs. Original files remain local and unchanged. Case count is bounded to 20.

1. `npm run benchmark:photos -- --manifest private-benchmarks/cases.json` validates inputs **without any AI calls**.
2. Put `OPENAI_API_KEY`, `OPENAI_MODEL` and `OPENAI_REASONING_EFFORT` in `.env.local` on that computer. Never commit or paste the key into chat.
3. `npm run benchmark:photos -- --manifest private-benchmarks/cases.json --live --max-calls 1` explicitly authorizes one interpretation per case. Increase the bound to your dataset size, at most 20. It is a request-count bound, not a price estimate. No ambiguous paid request is retried automatically.

The live run uses the production category prompt, schema, native compiler, bounded repairs and fidelity gates. Reports contain timings, input hashes, feature comparisons, exact piece counts, digital validation and geometry fingerprints. Raw photos, local file paths, provider error bodies and credentials are excluded. Reports are written only under the ignored private folder with private filesystem permissions. Interpreted text can reflect image content; treat reports as private too.

Start with 5–10 House subjects spanning rectangular/L-shaped homes, roof shapes and pitches, 1–3 storeys, varied window placement, and difficult/occluded views. Check the result against every supplied view. Record human ratings for silhouette, proportions, roof, window/door layout, color and recognizability; record unsupported subjects and missed features rather than replacing them with demo successes. Repeat the same dataset after compiler/prompt changes. Expected-feature checks are not photo resemblance scores. Physical fit, clutch, balance and instruction usability require actual builds.
