import { statfsSync } from "node:fs";
import { tmpdir } from "node:os";

function freeMb(dir: string): number | null {
  try {
    const { bavail, bsize } = statfsSync(dir);
    return Math.round((bavail * bsize) / 1_048_576);
  } catch {
    return null;
  }
}

/** Free space in the temp folder, where serverless Chromium keeps its binary and profile. */
export function tmpFreeMb(): number | null {
  return freeMb(tmpdir());
}

/** Free space for Chromium's shared memory, which falls back to the temp folder without it. */
export function shmFreeMb(): number | null {
  return freeMb("/dev/shm");
}
