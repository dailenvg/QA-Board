import { lstatSync, readdirSync, statfsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MB = 1_048_576;

/**
 * Free space in the temp folder. Serverless Chromium keeps its binary, profile
 * and shared memory there (Lambda has no /dev/shm), so a long page can run it out.
 */
export function tmpFreeMb(): number {
  const { bavail, bsize } = statfsSync(tmpdir());
  return Math.round((bavail * bsize) / MB);
}

/** The temp folder's top-level entries, for logs: `chromium 160MB, fonts/, ...`. Not recursive. */
export function tmpListing(): string {
  return readdirSync(tmpdir())
    .map((name) => {
      const stat = lstatSync(join(tmpdir(), name), { throwIfNoEntry: false });
      if (!stat) return name;
      return stat.isDirectory() ? `${name}/` : `${name} ${Math.round(stat.size / MB)}MB`;
    })
    .join(", ");
}
