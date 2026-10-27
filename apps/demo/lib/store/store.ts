import { legacyFolderChecked, markLegacyFolderChecked, withoutLegacyFolder } from "./legacy-folder";
import { migrateImages } from "./migrate-images";
import {
  createInitialData,
  isQuotaError,
  LEGACY_STORAGE_KEYS,
  parseData,
  STORAGE_KEY,
  type PendingImage,
} from "./persist";
import { reduce, type Action } from "./reducer";
import type { SquintData } from "./types";

export type StoreState =
  | { status: "loading" }
  /** `persistent` is false when the browser blocks storage; changes then last for this visit only. */
  | { status: "ready"; data: SquintData; persistent: boolean }
  | { status: "corrupt"; reason: string; raw: string };

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

const QUOTA_MESSAGE =
  "This browser's storage is full. Delete a project or use a smaller image, then try again.";
const WRITE_MESSAGE = "Your change couldn't be saved in this browser. Try again.";
const UNAVAILABLE_MESSAGE =
  "Your projects aren't available right now. Reload the page and try again.";

const LOADING: StoreState = { status: "loading" };

let state: StoreState | null = null;
let migrating = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function removeLegacy(): void {
  try {
    for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key);
  } catch {
    // Leaving an old copy behind is harmless; version 3 is read first.
  }
}

/**
 * Data saved by an earlier version (already upgraded in memory): move any
 * version 1 images to the blob store, then save it as version 3 and drop the
 * old copies. All or nothing: if any step fails, the old copy stays exactly
 * as it was and this visit runs unsaved (the next load tries again). Once
 * saved, the leftover folder check (see `load`) is done too.
 */
function migrate(data: SquintData, images: readonly PendingImage[]): void {
  if (migrating) return;
  migrating = true;
  void migrateImages(images).then((imagesSaved) => {
    migrating = false;
    const saved = imagesSaved && write(data).ok;
    if (saved) {
      removeLegacy();
      markLegacyFolderChecked();
    }
    state = { status: "ready", data, persistent: saved };
    emit();
  });
}

/** The version 3 copy, else the newest older one (`legacy`). */
function readStored(): { raw: string | null; legacy: boolean } {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== null) return { raw, legacy: false };
  for (const key of LEGACY_STORAGE_KEYS) {
    const legacy = localStorage.getItem(key);
    if (legacy !== null) return { raw: legacy, legacy: true };
  }
  return { raw: null, legacy: false };
}

/**
 * Finishes a version 3 load that checked for the leftover default folder
 * (`legacy-folder.ts`). A removal is saved before the check is marked done;
 * if the save fails, the folder stays (as with any failed write) and the next
 * load checks again.
 */
function finishLegacyFolderCheck(stored: SquintData, data: SquintData): StoreState {
  const saved = data === stored || write(data).ok;
  if (saved) markLegacyFolderChecked();
  return { status: "ready", data: saved ? data : stored, persistent: true };
}

/** Reads the saved data, dropping the leftover default folder on the first load that checks. */
function load(): StoreState {
  let stored: { raw: string | null; legacy: boolean };
  try {
    stored = readStored();
  } catch {
    return { status: "ready", data: createInitialData(), persistent: false };
  }
  const { raw, legacy } = stored;
  if (raw === null) return { status: "ready", data: createInitialData(), persistent: true };
  const parsed = parseData(raw);
  if (!parsed.ok) return { status: "corrupt", reason: parsed.reason, raw };
  const checking = !legacyFolderChecked();
  const data = checking ? withoutLegacyFolder(parsed, raw) : parsed.data;
  if (!legacy && parsed.storedVersion === 3 && parsed.pendingImages.length === 0) {
    if (checking) return finishLegacyFolderCheck(parsed.data, data);
    return { status: "ready", data, persistent: true };
  }
  migrate(data, parsed.pendingImages);
  return LOADING;
}

function onStorage(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  state = load();
  emit();
}

export function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function getSnapshot(): StoreState {
  state ??= load();
  return state;
}

export function getServerSnapshot(): StoreState {
  return LOADING;
}

function write(data: SquintData): Result {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: isQuotaError(error) ? QUOTA_MESSAGE : WRITE_MESSAGE };
  }
}

/** Applies an action and persists it. On a failed write nothing changes in memory either. */
export function dispatch(action: Action): Result {
  const current = getSnapshot();
  if (current.status !== "ready") return { ok: false, error: UNAVAILABLE_MESSAGE };
  const next = reduce(current.data, action);
  if (next === current.data) return { ok: true, value: undefined };
  if (current.persistent) {
    const saved = write(next);
    if (!saved.ok) return saved;
  }
  state = { ...current, data: next };
  emit();
  return { ok: true, value: undefined };
}

/** Discards unreadable data and starts over with an empty workspace (no folders yet). */
export function resetData(): Result {
  const data = createInitialData();
  const saved = write(data);
  if (saved.ok) removeLegacy();
  state = { status: "ready", data, persistent: saved.ok };
  emit();
  return saved;
}
