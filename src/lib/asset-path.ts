/** Public assets need an explicit prefix when hosted under a GitHub repository path. */
export function assetPath(path: string) {
  return `${process.env.NEXT_PUBLIC_BASE_PATH || ""}${path}`;
}
