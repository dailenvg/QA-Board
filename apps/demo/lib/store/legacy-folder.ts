import { DEFAULT_FOLDER_NAME } from "./persist";
import type { SquintData } from "./types";

/** Set once this browser has been checked for the leftover folder, kept apart from the workspace data. */
export const LEGACY_FOLDER_CHECK_KEY = "squint:legacy-folder-cleanup";

/**
 * The first production deploy where fresh workspaces start with no folders
 * (2026-10-26 19:28 UTC). Only a folder made before it can be the leftover.
 */
export const NO_DEFAULT_FOLDER_SINCE = Date.UTC(2026, 9, 26, 19, 28);

/**
 * Before that deploy every new browser got an empty top-level "My projects"
 * folder, which hides the welcome screen. True only for that folder as it was
 * made: the only folder, never renamed, made before the cutoff, in a workspace
 * that holds nothing else (no projects, comments, snapshots, pending
 * revocations or comment author name).
 */
function isUntouchedLegacyFolder(data: SquintData): boolean {
  const [folder, ...others] = data.folders;
  return (
    folder !== undefined &&
    others.length === 0 &&
    folder.parentId === null &&
    folder.name === DEFAULT_FOLDER_NAME &&
    folder.createdAt < NO_DEFAULT_FOLDER_SINCE &&
    data.projects.length === 0 &&
    data.comments.length === 0 &&
    data.snapshots.length === 0 &&
    data.revocations.length === 0 &&
    data.authorName === null
  );
}

/** The workspace without the leftover folder, or the same object when it has none. */
export function withoutLegacyFolder(data: SquintData): SquintData {
  return isUntouchedLegacyFolder(data) ? { ...data, folders: [] } : data;
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
