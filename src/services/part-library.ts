import { assetPath } from "@/lib/asset-path";
import ldrawManifest from "../../public/catalog/manifest.json";
import rebrickableManifest from "../../public/catalog/rebrickable-manifest.json";
import type { LibraryIndex } from "@/domain/library/types";

export type CatalogSource = "rebrickable" | "ldraw";
const pending = new Map<CatalogSource, Promise<LibraryIndex>>();

/** Load a source only when requested, keeping identity and color namespaces separate. */
export function loadPartLibrary(
  source: CatalogSource = "rebrickable",
): Promise<LibraryIndex> {
  const existing = pending.get(source);
  if (existing) return existing;
  const metadata =
    source === "rebrickable" ? rebrickableManifest : ldrawManifest;
  const file =
    source === "rebrickable" ? "rebrickable-index.json" : "index.json";
  const request = fetch(
    assetPath(`/catalog/${file}?v=${metadata.source.snapshotDate}`),
  )
    .then(async (response) => {
      if (!response.ok)
        throw new Error("The part library could not be loaded.");
      const index: LibraryIndex = await response.json();
      if (
        index.schemaVersion !== 1 ||
        !Array.isArray(index.parts) ||
        index.parts.length !== metadata.partCount ||
        !Array.isArray(index.colors)
      )
        throw new Error("The part library version does not match this app.");
      return index;
    })
    .catch((error) => {
      pending.delete(source);
      throw error;
    });
  pending.set(source, request);
  return request;
}
