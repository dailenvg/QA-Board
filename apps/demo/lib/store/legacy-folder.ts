import { DEFAULT_FOLDER_NAME } from "./persist";
import type { SquintData } from "./types";

/** Set once this browser has been checked for the leftover folder, kept apart from the workspace data. */
export const LEGACY_FOLDER_CHECK_KEY = "squint:legacy-folder-cleanup";

/**
 * The first production deploy where fresh workspaces start with no folders
 * (2026-10-26 19:28 UTC). Only a folder made before it can be the leftover.
 */
export const NO_DEFAULT_FOLDER_SINCE = Date.UTC(2026, 9, 26, 19, 28);

/** The fixed id the old seed gave that folder, in every browser. */
const LEGACY_FOLDER_ID = "default";

/** What can tie a folder to someone's work; stored data has none of it when the folder is untouched. */
const RECORD_LISTS = ["projects", "comments", "snapshots", "revocations"] as const;

/**
 * Before that deploy every new browser got an empty top-level "My projects"
 * folder, which hides the welcome screen. True only for that folder as it was
 * made: the only folder, with the seed's id and name, made before the cutoff,
 * and no comment author name saved.
 */
function isUntouchedLegacyFolder(data: SquintData): boolean {
  const [folder, ...others] = data.folders;
  return (
    folder !== undefined &&
    others.length === 0 &&
    folder.id === LEGACY_FOLDER_ID &&
    folder.parentId === null &&
    folder.name === DEFAULT_FOLDER_NAME &&
    folder.createdAt < NO_DEFAULT_FOLDER_SINCE &&
    data.authorName === null
  );
}

const isEmptyList = (value: unknown): boolean =>
  value === undefined || (Array.isArray(value) && value.length === 0);

/**
 * Whether the stored JSON holds no projects, comments, snapshots or
 * revocations, readable or not. Checked on what was saved rather than on what
 * load kept, so entries repair or lenient reading dropped still count.
 */
function storedNothingElse(raw: string): boolean {
  try {
    const value: unknown = JSON.parse(raw);
    return (
      typeof value === "object" &&
      value !== null &&
      RECORD_LISTS.every((key) => isEmptyList((value as Record<string, unknown>)[key]))
    );
  } catch {
    return false;
  }
}

/**
 * The loaded workspace without the leftover folder, or the same object when it
 * has none. Data that load had to repair is left alone, so removing the folder
 * never also saves what repair dropped.
 */
export function withoutLegacyFolder(
  loaded: { data: SquintData; repaired: boolean },
  raw: string,
): SquintData {
  const { data, repaired } = loaded;
  if (repaired || !isUntouchedLegacyFolder(data) || !storedNothingElse(raw)) return data;
  return { ...data, folders: [] };
}

/** Whether this browser was already checked; false where storage is blocked (a repeat is harmless). */
export function legacyFolderChecked(): boolean {
  try {
    return localStorage.getItem(LEGACY_FOLDER_CHECK_KEY) !== null;
  } catch {
    return false;
  }
}

export function markLegacyFolderChecked(): void {
  try {
    localStorage.setItem(LEGACY_FOLDER_CHECK_KEY, "1");
  } catch {
    // Not remembered: the next load checks again, and the rules above keep that safe.
  }
}
