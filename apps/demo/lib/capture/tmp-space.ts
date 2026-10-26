import { statfsSync } from "node:fs";
import { tmpdir } from "node:os";

/** Free space in the temp folder, where serverless Chromium keeps its binary, profile and shared memory. */
export function tmpFreeMb(): number {
  const { bavail, bsize } = statfsSync(tmpdir());
  return Math.round((bavail * bsize) / 1_048_576);
}
