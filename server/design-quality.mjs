/** Bounded category-specific repairs; the source interpretation is retained. */
export function repairDescription(s, attempt) {
  if (!attempt || s.version === 3) return s;
  if (!("category" in s))
    return attempt === 1
      ? { ...s, chimney: false, garden: false }
      : {
          ...s,
          chimney: false,
          garden: false,
          frontWindows: Math.min(1, s.frontWindows),
          rearWindows: 0,
          leftWindows: 0,
          rightWindows: 0,
        };
  switch (s.category) {
    case "flower":
      return {
        ...s,
        leafCount: 0,
        ...(attempt > 1 ? { bloomKind: "round" } : {}),
      };
    case "car":
      return { ...s, roofRack: false, stripe: false };
    case "animal":
      return {
        ...s,
        tail: "none",
        ...(attempt > 1 ? { markings: "none", headSize: "small" } : {}),
      };
    case "free":
      return s;
  }
}
export function evaluateFidelity(description, result) {
  // Version 3 measures agreement with the reference silhouettes during compilation.
  if (description.version === 3) return result.fidelity;
  if (!("category" in description)) {
    const desired =
      description.frontWindows +
      description.rearWindows +
      description.leftWindows +
      description.rightWindows;
    const retained = result.model.studio.windowCounts.reduce(
      (a, b) => a + b,
      0,
    );
    return {
      ...result.fidelity,
      windowRetention: desired ? Math.min(1, retained / desired) : 1,
    };
  }
  const s = description,
    metadata = result.model.subject;
  const requested =
    s.category === "flower"
      ? { "main blooms": s.bloomCount, "bloom form": 1, leaves: s.leafCount }
      : s.category === "car"
        ? {
            "body shape": 1,
            "fixed wheel details": 4,
            "roof rack": Number(s.roofRack),
            stripe: Number(s.stripe),
          }
        : s.category === "animal"
          ? {
              eyes: 2,
              ears: 2,
              tail: Number(s.tail !== "none"),
              markings: Number(s.markings !== "none"),
            }
          : { "described components": s.components.length };
  const retained = new Map(metadata.features.map((f) => [f.name, f.retained]));
  if (s.category === "flower" && metadata.description.bloomKind !== s.bloomKind)
    retained.set("bloom form", 0);
  const weight = (name) =>
    ["leaves", "roof rack", "stripe", "markings"].includes(name) ? 1 : 3;
  let score = 0,
    total = 0;
  for (const [name, count] of Object.entries(requested))
    if (count) {
      const w = weight(name);
      total += w;
      score += w * Math.min(1, (retained.get(name) || 0) / count);
    }
  let aspectRatioError = null;
  if (s.category === "car")
    aspectRatioError =
      Math.abs(
        metadata.footprintStuds[0] / metadata.footprintStuds[1] - s.aspectRatio,
      ) / s.aspectRatio;
  if (s.category === "free") {
    const xs = s.components.map((c) => c.x),
      zs = s.components.map((c) => c.z);
    const desired =
      (Math.max(...s.components.map((c) => c.x + c.width)) - Math.min(...xs)) /
      (Math.max(...s.components.map((c) => c.z + c.depth)) - Math.min(...zs));
    aspectRatioError =
      Math.abs(
        metadata.footprintStuds[0] / metadata.footprintStuds[1] - desired,
      ) / desired;
  }
  return {
    ...result.fidelity,
    aspectRatioError,
    featureRetention: total ? score / total : 1,
  };
}
export function passesFidelity(description, options, fidelity) {
  if (description.version === 3) {
    // Flowers are open forms (stems and leaves), so their silhouettes overlap less.
    const minimum = description.category === "flower" ? 0.3 : 0.55;
    const { front, side } = fidelity.silhouette;
    return (front + side) / 2 >= minimum && fidelity.featureRetention >= 0.5;
  }
  if (fidelity.aspectRatioError !== null && fidelity.aspectRatioError > 0.3)
    return false;
  return !("category" in description)
    ? fidelity.windowRetention >= (options.detail === "easy" ? 0.2 : 0.35)
    : fidelity.featureRetention >=
        (options.detail === "easy"
          ? 0.4
          : options.detail === "normal"
            ? 0.65
            : 0.75);
}
