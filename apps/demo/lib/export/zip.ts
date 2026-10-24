import { strToU8, zipSync, type Zippable } from "fflate";
import { JSON_FILE, MARKDOWN_FILE } from "./paths";

/**
 * Packs the Markdown, JSON and images into one ZIP. Images are already
 * compressed, so they're stored as they are; only the text is deflated.
 */
export async function buildZip(
  markdown: string,
  json: string,
  files: ReadonlyMap<string, Blob>,
): Promise<Blob> {
  const entries: Zippable = {
    [MARKDOWN_FILE]: strToU8(markdown),
    [JSON_FILE]: strToU8(json),
  };
  for (const [path, blob] of files) {
    entries[path] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
  }
  return new Blob([new Uint8Array(zipSync(entries, { level: 6 }))], { type: "application/zip" });
}
