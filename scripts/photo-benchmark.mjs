import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  loadBenchmark,
  runPhotoBenchmark,
} from "../server/photo-benchmark.mjs";
const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
if (!value("--manifest")) {
  console.error(
    "Usage: npm run benchmark:photos -- --manifest private-benchmarks/cases.json [--live --max-calls 5]",
  );
  process.exit(1);
}
const abort = new AbortController();
process.once("SIGINT", () => abort.abort());
try {
  const cases = await loadBenchmark(resolve(value("--manifest")));
  const report = await runPhotoBenchmark(cases, {
    live: args.includes("--live"),
    maxCalls: Number(value("--max-calls") || 0),
    signal: abort.signal,
    onCase: (r) => console.info(JSON.stringify(r)),
  });
  const folder = resolve("private-benchmarks/reports");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await writeFile(
    resolve(folder, `report-${Date.now()}.json`),
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  console.info(
    `Saved private report. Provider calls attempted: ${report.paidCallsAttempted}. Human resemblance and physical checks remain pending.`,
  );
  if (
    report.results.some(
      (r) => r.status === "failed" || r.featureChecks?.some((c) => !c.passed),
    )
  )
    process.exitCode = 1;
} catch {
  console.error(
    "Benchmark stopped. Check the manifest, input permissions and live-call settings. No private error details were printed.",
  );
  process.exitCode = 1;
}
