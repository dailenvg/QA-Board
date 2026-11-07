import { clearBlobs } from "../blob-store/blob-store";
import { LEGACY_FOLDER_CHECK_KEY, legacyFolderChecked, withoutLegacyFolder } from "./legacy-folder";
import { LEGACY_STORAGE_KEYS, parseData, STORAGE_KEY, type PendingImage } from "./persist";
import type { SquintData } from "./types";

/**
 * What an earlier, local-first build left in this browser (`squint:v3`, or an
 * older key, upgraded in memory): material for the one-shot import into the
 * workspace. Read and cleared only; nothing here writes it.
 */
export type LocalData =
  | { status: "none" }
  | {
      status: "found";
      data: SquintData;
      /** Version 1 images, still inline as data URLs (the others are in `blob-store`). */
      pendingImages: PendingImage[];
    }
  | { status: "unreadable"; reason: string; raw: string };

const NONE: LocalData = { status: "none" };

/** The newest copy this browser has: version 3, else the newest older one. */
function readStored(): string | null {
  for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
    const raw = localStorage.getItem(key);
    if (raw !== null) return raw;
  }
  return null;
}

/**
 * The browser's local workspace, if any. The empty folder every browser got
 * before workspaces started empty (`legacy-folder.ts`) doesn't count as data.
 */
export function readLocalData(): LocalData {
  let raw: string | null;
  try {
    raw = readStored();
  } catch {
    return NONE;
  }
  if (raw === null) return NONE;
  const parsed = parseData(raw);
  if (!parsed.ok) return { status: "unreadable", reason: parsed.reason, raw };
  const data = legacyFolderChecked() ? parsed.data : withoutLegacyFolder(parsed, raw);
  const empty = data.folders.length === 0 && data.projects.length === 0;
  return empty ? NONE : { status: "found", data, pendingImages: parsed.pendingImages };
}

/** Forgets the local workspace and its images, once imported (or declined). */
export async function clearLocalData(): Promise<void> {
  try {
    for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS, LEGACY_FOLDER_CHECK_KEY]) {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: there was nothing readable to clear either.
  }
  await clearBlobs();
}
