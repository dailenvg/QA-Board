// Copies the pdf.js data the PDF importer reads (standard fonts, CMaps, ICC
// profiles and image-decoder WebAssembly) into public/pdfjs/<version>/, so it's
// served from this app and never fetched elsewhere. Runs before `next dev` and
// `next build`; skips work when this version is already in place. The scripting
// sandbox (quickjs-eval) and the decoders' plain-JS fallbacks are left out.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const app = dirname(dirname(fileURLToPath(import.meta.url)));
const source = dirname(require.resolve("pdfjs-dist/package.json"));
const { version } = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
const root = join(app, "public", "pdfjs");
const target = join(root, version);
const marker = join(target, ".complete");

/** What's copied from each folder of pdfjs-dist. */
const FOLDERS = {
  standard_fonts: () => true,
  cmaps: () => true,
  iccs: () => true,
  wasm: (name) =>
    name.endsWith(".wasm") ? !name.startsWith("quickjs") : name.startsWith("LICENSE"),
};

if (existsSync(marker)) process.exit(0);
rmSync(root, { recursive: true, force: true });
for (const [folder, keep] of Object.entries(FOLDERS)) {
  const from = join(source, folder);
  const to = join(target, folder);
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from).filter(keep).sort()) {
    cpSync(join(from, name), join(to, name));
  }
}
writeFileSync(marker, `${version}\n`);
console.warn(`pdf.js ${version} assets copied to public/pdfjs/${version}/`);
