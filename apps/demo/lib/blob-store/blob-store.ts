/**
 * Images an earlier build kept in this browser's IndexedDB (snapshots,
 * comment crops, pages), under the keys its saved data points at (see
 * `keys.ts`). Signed-in work lives on the server now: this is only read for
 * the one-shot import, then cleared.
 */

const DB_NAME = "squint-blobs";
const DB_VERSION = 1;
const STORE = "blobs";

interface BlobRecord {
  key: string;
  blob: Blob;
}

let database: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  database ??= new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "key" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  }).then((db) => {
    // Not cached when it failed, so a later try opens it again.
    if (!db) database = null;
    return db;
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

/**
 * The image saved under `key`, or null when this browser has none. Throws
 * when IndexedDB can't be opened or read, so a failed read is never taken
 * for a missing image.
 */
export async function getBlob(key: string): Promise<Blob | null> {
  const db = await open();
  if (!db) throw new Error("This browser's image store can't be opened.");
  const value: unknown = await run(db, "readonly", (store) => store.get(key));
  return isRecord(value) ? value.blob : null;
}

/** Deletes every image this browser kept. Best effort: a failure leaves them for a later try. */
export async function clearBlobs(): Promise<void> {
  const db = await open();
  if (!db) return;
  await run(db, "readwrite", (store) => store.clear()).catch(() => undefined);
}
