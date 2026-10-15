/** Node 24 worker loader: native TypeScript transforms and the app's existing aliases. */
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, dirname, extname } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier.startsWith("@/") ||
      (specifier.startsWith(".") && context.parentURL?.startsWith("file:"))
    ) {
      const base = specifier.startsWith("@/")
        ? resolve(root, "src", specifier.slice(2))
        : resolve(dirname(fileURLToPath(context.parentURL)), specifier);
      const target = [
        base,
        ...(!extname(base)
          ? [
              base + ".ts",
              base + ".tsx",
              base + ".js",
              base + ".mjs",
              base + ".json",
              base + "/index.ts",
            ]
          : []),
      ].find((p) => existsSync(p) && extname(p));
      if (target) return next(pathToFileURL(target).href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (
      url.startsWith("file:") &&
      url.endsWith(".ts") &&
      !url.includes("/node_modules/")
    )
      return {
        format: "module",
        source: stripTypeScriptTypes(readFileSync(new URL(url), "utf8"), {
          mode: "transform",
          sourceUrl: url,
        }),
        shortCircuit: true,
      };
    if (
      url.startsWith("file:") &&
      url.endsWith(".json") &&
      !url.includes("/node_modules/")
    )
      return {
        format: "module",
        source: `export default ${readFileSync(new URL(url), "utf8")};`,
        shortCircuit: true,
      };
    return next(url, context);
  },
});
