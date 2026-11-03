import { readFile } from "node:fs/promises";

/** Node module hook: `import sql from "./x.sql"` gives the file's text, as webpack and vitest do. */
export async function load(url, context, nextLoad) {
  if (!url.endsWith(".sql")) return nextLoad(url, context);
  const text = await readFile(new URL(url), "utf8");
  return {
    format: "module",
    source: `export default ${JSON.stringify(text)};`,
    shortCircuit: true,
  };
}
