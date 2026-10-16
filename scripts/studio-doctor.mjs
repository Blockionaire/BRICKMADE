import { inspectStudio } from "../server/studio-doctor.mjs";
const report = await inspectStudio();
if (process.argv.includes("--json"))
  console.info(JSON.stringify(report, null, 2));
else {
  for (const check of report.checks)
    console.info(
      `${check.status === "passed" ? "PASS" : "FAIL"} ${check.name}: ${check.detail} [${check.code}]`,
    );
  console.info(
    "No users/jobs were created and no OpenAI calls were made. Readiness does not certify photo accuracy or physical buildability.",
  );
}
process.exitCode = report.ready ? 0 : 1;
