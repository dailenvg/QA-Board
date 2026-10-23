type StorageKind = "localStorage" | "sessionStorage";

function getStorage(kind: StorageKind): Storage | null {
  try {
    return typeof window === "undefined" ? null : window[kind];
  } catch {
    return null;
  }
}

/** Storage access that never throws (private mode, disabled cookies, SSR). */
export function readStorage(kind: StorageKind, key: string): string | null {
  try {
    return getStorage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorage(kind: StorageKind, key: string, value: string): void {
  try {
    getStorage(kind)?.setItem(key, value);
  } catch {
    // Storage is best-effort; the in-memory value still works for this page view.
  }
}

export function removeStorage(kind: StorageKind, key: string): void {
  try {
    getStorage(kind)?.removeItem(key);
  } catch {
    // Ignore: nothing to clean up if storage is unavailable.
  }
}
