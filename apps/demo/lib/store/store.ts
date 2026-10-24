import { isQuotaError, parseData, createInitialData, STORAGE_KEY } from "./persist";
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

/** Deterministic, so two fresh tabs seed the same default folder. */
const DEFAULT_FOLDER_ID = "default";
const LOADING: StoreState = { status: "loading" };

let state: StoreState | null = null;
const listeners = new Set<() => void>();

function seed(): SquintData {
  return createInitialData(DEFAULT_FOLDER_ID, Date.now());
}

function load(): StoreState {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { status: "ready", data: seed(), persistent: false };
  }
  if (raw === null) return { status: "ready", data: seed(), persistent: true };
  const parsed = parseData(raw);
  if (!parsed.ok) return { status: "corrupt", reason: parsed.reason, raw };
  return { status: "ready", data: parsed.data, persistent: true };
}

function emit(): void {
  for (const listener of listeners) listener();
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

/** Discards unreadable data and starts over with the default folder. */
export function resetData(): Result {
  const data = seed();
  const saved = write(data);
  state = { status: "ready", data, persistent: saved.ok };
  emit();
  return saved;
}
