import type { Placement, PartQuantity } from "./types";

export function countParts(placements: Placement[]): PartQuantity[] {
  const counts = new Map<string, PartQuantity>();
  for (const p of placements) {
    const key = `${p.partId}:${p.color}`;
    const current = counts.get(key);
    if (current) current.quantity += 1;
    else
      counts.set(key, { key, partId: p.partId, color: p.color, quantity: 1 });
  }
  return [...counts.values()].sort((a, b) => b.quantity - a.quantity);
}
