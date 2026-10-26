#!/usr/bin/env node
/**
 * Fixes up `vercel build` output before `vercel deploy --prebuilt`.
 *
 * The Next.js builder links identical functions to one copy (`index.func -> p/[id].func`).
 * Services deployments reject symlinked function folders ("invalid deployment package"),
 * so each link is replaced with a real copy.
 *
 * Usage, from the repo root: node scripts/vercel-prebuilt-fixups.mjs
 */
import { cpSync, existsSync, lstatSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";

const OUTPUT = ".vercel/output";

if (!existsSync(OUTPUT)) {
  console.error(`No ${OUTPUT}: run \`vercel build\` first.`);
  process.exit(1);
}

/** Every path under `dir`, deepest first, so a link to a link is copied after its target. */
function walk(dir) {
  const paths = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) paths.push(...walk(path));
    paths.push(path);
  }
  return paths;
}

const byDepth = (a, b) => b.split("/").length - a.split("/").length;

let copied = 0;
for (const path of walk(OUTPUT).sort(byDepth)) {
  if (!lstatSync(path).isSymbolicLink()) continue;
  const target = realpathSync(path);
  rmSync(path);
  cpSync(target, path, { recursive: true, dereference: true });
  copied += 1;
}

console.log(`Replaced ${copied} linked functions.`);
