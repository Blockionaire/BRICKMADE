/** Provider IDs and manufactured colors must be resolved explicitly, never guessed from a render color. */
export interface SourcingLine {
  partId: string;
  quantity: number;
  condition: "N" | "U";
  partColorVerified: boolean;
  brickLink?: {
    partId: string;
    colorId: number;
    status: "verified" | "unverified" | "ambiguous";
    evidence: string;
  };
}
export interface SourcingReadiness {
  ready: boolean;
  missing: { partId: string; reason: string }[];
}

export function shoppingReadiness(lines: SourcingLine[]): SourcingReadiness {
  const missing = lines.flatMap((line) => {
    let reason = "";
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1)
      reason = "Invalid quantity";
    else if (!["N", "U"].includes(line.condition))
      reason = "Choose new or used condition";
    else if (line.partColorVerified !== true)
      reason = "Manufactured part/color combination is unverified";
    else if (
      !line.brickLink ||
      line.brickLink.status !== "verified" ||
      typeof line.brickLink.evidence !== "string" ||
      !line.brickLink.evidence.trim()
    )
      reason = "Exact BrickLink mapping needs verification";
    else if (
      typeof line.brickLink.partId !== "string" ||
      !/^[a-z0-9._-]+$/i.test(line.brickLink.partId) ||
      !Number.isSafeInteger(line.brickLink.colorId) ||
      line.brickLink.colorId < 0
    )
      reason = "Invalid provider identity";
    return reason ? [{ partId: line.partId, reason }] : [];
  });
  return { ready: lines.length > 0 && missing.length === 0, missing };
}

/** A reviewed wanted-list handoff, not stock confirmation, checkout, or a price estimate. */
export function exportBrickLinkWantedList(lines: SourcingLine[]): string {
  if (!shoppingReadiness(lines).ready)
    throw new Error(
      "Resolve every part/color and provider mapping before exporting a shopping list.",
    );
  const merged = new Map<string, SourcingLine>();
  for (const line of lines) {
    const mapping = line.brickLink!;
    const key = `${mapping.partId}:${mapping.colorId}:${line.condition}`;
    const previous = merged.get(key);
    const quantity = line.quantity + (previous?.quantity ?? 0);
    if (!Number.isSafeInteger(quantity))
      throw new Error("Quantity exceeds the supported range.");
    merged.set(key, { ...line, quantity });
  }
  return `<INVENTORY>\n${[...merged.values()].map((line) => `  <ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>${line.brickLink!.partId}</ITEMID><COLOR>${line.brickLink!.colorId}</COLOR><MINQTY>${line.quantity}</MINQTY><CONDITION>${line.condition}</CONDITION></ITEM>`).join("\n")}\n</INVENTORY>`;
}
