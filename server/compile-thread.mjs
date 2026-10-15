import { parentPort, workerData } from "node:worker_threads";
import { compileHouse } from "./compile-house.mjs";
try {
  parentPort.postMessage({
    result: await compileHouse(
      workerData.description,
      workerData.options,
      async () => {
        parentPort.postMessage({ phase: "checking" });
        await new Promise((resolve) => parentPort.once("message", resolve));
      },
    ),
  });
} catch {
  parentPort.postMessage({
    error: "The house compiler could not finish this design.",
  });
}
