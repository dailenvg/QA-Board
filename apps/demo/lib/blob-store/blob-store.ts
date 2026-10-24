/**
 * Images (snapshots and comment crops) live in IndexedDB, not localStorage,
 * which is too small for them. Keys are plain strings (see `keys.ts`), so
 * export and sharing can address any blob the saved data points at. When
 * IndexedDB is unavailable, blobs are kept in memory for this visit only.
 */

const DB_NAME = "squint-blobs";
const DB_VERSION = 1;
const STORE = "blobs";

export interface BlobEntry {
  key: string;
  createdAt: number;
}

interface BlobRecord extends BlobEntry {
  blob: Blob;
}

/** Blobs kept for this visit only: everything when IndexedDB is unavailable, else held images. */
const memory = new Map<string, BlobRecord>();
const listeners = new Map<string, Set<() => void>>();
let database: Promise<IDBDatabase | null> | null = null;

function notify(key: string): void {
  for (const listener of listeners.get(key) ?? []) listener();
}

/** Calls `listener` whenever the blob under `key` is saved or deleted in this tab. */
export function subscribeBlob(key: string, listener: () => void): () => void {
  const set = listeners.get(key) ?? new Set();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

/**
 * Keeps a blob in memory for this visit, ahead of IndexedDB. Used when a
 * write was refused, so the image still shows until the page is reloaded.
 */
export function holdBlob(key: string, blob: Blob): void {
  memory.set(key, { key, blob, createdAt: Date.now() });
  notify(key);
}

function open(): Promise<IDBDatabase | null> {
  database ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "key" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return database;
}

function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = work(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB aborted"));
  });
}

function isRecord(value: unknown): value is BlobRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "key" in value &&
    "blob" in value &&
    value.blob instanceof Blob
  );
}

/** Saves a blob under `key`, replacing any earlier one. False when the browser refuses (quota). */
export async function putBlob(key: string, blob: Blob): Promise<boolean> {
  const record: BlobRecord = { key, blob, createdAt: Date.now() };
  const db = await open();
  if (!db) {
    memory.set(key, record);
    notify(key);
    return true;
  }
  try {
    await run(db, "readwrite", (store) => store.put(record));
    memory.delete(key);
    notify(key);
    return true;
  } catch {
    return false;
  }
}

export async function getBlob(key: string): Promise<Blob | null> {
  const held = memory.get(key);
  if (held) return held.blob;
  const db = await open();
  if (!db) return null;
  try {
    const value: unknown = await run(db, "readonly", (store) => store.get(key));
    return isRecord(value) ? value.blob : null;
  } catch {
    return null;
  }
}

export async function deleteBlobs(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  for (const key of keys) memory.delete(key);
  const db = await open();
  if (db) {
    await Promise.all(
      keys.map((key) => run(db, "readwrite", (store) => store.delete(key)).catch(() => undefined)),
    );
  }
  for (const key of keys) notify(key);
}

/** Every stored blob's key and save time, without reading the images. */
export async function listBlobs(): Promise<BlobEntry[]> {
  const held = [...memory.values()].map(({ key, createdAt }) => ({ key, createdAt }));
  const db = await open();
  if (!db) return held;
  try {
    const values: unknown[] = await run(db, "readonly", (store) => store.getAll());
    return [...held, ...values.filter(isRecord).map(({ key, createdAt }) => ({ key, createdAt }))];
  } catch {
    return held;
  }
}
