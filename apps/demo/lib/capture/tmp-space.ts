import { statfsSync } from "node:fs";
import { tmpdir } from "node:os";

/**
 * Free space in the temp folder. Serverless Chromium keeps its binary, profile
 * and shared memory there (Lambda has no /dev/shm), so a long page can run it out.
 */
export function tmpFreeMb(): number {
  const { bavail, bsize } = statfsSync(tmpdir());
  return Math.round((bavail * bsize) / 1_048_576);
}
