import { validateAssembly } from "../domain/validation/assembly";
import type { HouseModel } from "../domain/types";
import type { CollisionShape } from "../domain/validation/collision";
self.onmessage = (
  event: MessageEvent<{
    model: HouseModel;
    shapes: [string, CollisionShape][];
  }>,
) => {
  try {
    self.postMessage({
      report: validateAssembly(event.data.model, new Map(event.data.shapes)),
    });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "Assembly validation failed.",
    });
  }
};
