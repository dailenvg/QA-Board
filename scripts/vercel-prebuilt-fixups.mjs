#!/usr/bin/env node
/**
 * Fixes up `vercel build` output before `vercel deploy --prebuilt`.
 *
 * - The Next.js builder links identical functions to one copy (`index.func -> p/[id].func`).
 *   Services deployments reject symlinked function folders ("invalid deployment package"),
 *   so each link is replaced with a real copy.
 * - @sparticuz/chromium ships x64 binaries only, and functions default to arm64, so the
 *   screenshot capture functions are switched to x86_64.
 *
 * Usage, from the repo root: node scripts/vercel-prebuilt-fixups.mjs
 */
import {
  cpSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

const OUTPUT = ".vercel/output";
/** Functions that launch Chromium. */
const X64_FUNCTIONS = /(^|\/)api\/(s\/\[token\]\/)?capture(\.rsc)?\.func$/;

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

let switched = 0;
for (const path of walk(OUTPUT)) {
  if (!path.endsWith(".vc-config.json")) continue;
  const fn = relative(OUTPUT, join(path, ".."));
  if (!X64_FUNCTIONS.test(fn)) continue;
  const config = JSON.parse(readFileSync(path, "utf8"));
  config.architecture = "x86_64";
  writeFileSync(path, JSON.stringify(config, null, 2));
  switched += 1;
}

console.log(`Replaced ${copied} linked functions; ${switched} capture functions set to x86_64.`);
