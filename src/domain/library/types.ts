export interface LibraryPart {
  id: string;
  name: string;
  category: string;
  tags: string[];
  author?: string;
  update?: string;
  keywords?: string;
  material?: string;
  observedColorIds?: number[];
  elementCount?: number;
}

export interface LibraryColor {
  id: number;
  name: string;
  hex: string;
  edge: string;
  alpha: number;
}

export interface LibraryIndex {
  schemaVersion: 1;
  parts: LibraryPart[];
  colors: LibraryColor[];
}

export interface LibraryPreview {
  id: string;
  color: number;
  file: string;
  dependencyCount: number;
  sha256: string;
}

export const LIBRARY_FEATURES = [
  "Rounded",
  "Glass & windows",
  "Plants & flowers",
  "Technic",
  "Wheels & tyres",
  "Decorated",
] as const;

export function searchLibrary(
  parts: LibraryPart[],
  query: string,
  category = "all",
  feature = "all",
) {
  const words = query
    .toLowerCase()
    .replaceAll("×", "x")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts.filter((part) => {
    if (category !== "all" && part.category !== category) return false;
    if (feature !== "all" && !part.tags.includes(feature)) return false;
    const text =
      `${part.id} ${part.name} ${part.category} ${part.keywords ?? ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
