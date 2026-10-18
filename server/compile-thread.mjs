import { parentPort, workerData } from "node:worker_threads";
import { compileHouse } from "./compile-house.mjs";
import { compileSubject } from "./compile-subject.mjs";
import { compileSculpt } from "./compile-sculpt.mjs";
import { isSculptDesign } from "../shared/sculpt-design.ts";
try {
  parentPort.postMessage({
    result: await (
      isSculptDesign(workerData.description)
        ? compileSculpt
        : workerData.options.category === "house"
          ? compileHouse
          : compileSubject
    )(workerData.description, workerData.options, async () => {
      parentPort.postMessage({ phase: "checking" });
      await new Promise((resolve) => parentPort.once("message", resolve));
    }),
  });
} catch {
  parentPort.postMessage({
    error: "The category compiler could not finish this design.",
  });
}
