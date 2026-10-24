import { randomUUID } from "node:crypto";
import type { CapturedImage } from "../capture/capture-page";
import type { ShareServices } from "./server";
import { blobKind, SHARE_LIMITS, type BlobKind } from "./schemas";
import { sniffImageType } from "./sniff";
import type { ShareStore } from "./store";
import { createSecret, createShareId, hashSecret, isSecretShape, secretMatches } from "./tokens";
import { digest } from "./digest";
import type {
  ClientView,
  CreatedShare,
  ShareChange,
  ShareManifest,
  Sequenced,
  SharedComment,
  SharedProject,
  SharedSnapshot,
  ShareChanges,
  ShareRecord,
  ShareState,
} from "./types";

export type Failure = { ok: false; status: 400 | 404 | 409 | 413 | 415 | 422; error: string };
export type Outcome<T> = { ok: true; value: T } | Failure;
export type { CreatedShare } from "./types";

const fail = (status: Failure["status"], error: string): Failure => ({ ok: false, status, error });
const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });

/** A client's new comment, before the server sets its status and timestamps. */
export type ClientCommentInput = Omit<
  SharedComment,
  "status" | "createdAt" | "updatedAt" | "resolvedAt"
>;

// ── Access ─────────────────────────────────────────────────────────────────

/** The share, if `ownerKey` is its owner key. Unknown share and wrong key look the same. */
export async function ownerShare(
  store: ShareStore,
  shareId: string,
  ownerKey: string | null,
): Promise<ShareRecord | null> {
  if (!ownerKey || !isSecretShape(ownerKey)) return null;
  const share = await store.byId(shareId);
  return share && secretMatches(ownerKey, share.ownerKeyHash) ? share : null;
}

/** The share a client link opens. Unknown and revoked tokens look the same. */
export async function clientShare(store: ShareStore, token: string): Promise<ShareRecord | null> {
  if (!isSecretShape(token)) return null;
  const share = await store.byTokenHash(hashSecret(token));
  return share && secretMatches(token, share.tokenHash) ? share : null;
}

// ── Blob bookkeeping ───────────────────────────────────────────────────────

/** Every blob key the share's data points at. */
export function referencedKeys(
  project: SharedProject,
  snapshots: readonly SharedSnapshot[],
  comments: readonly SharedComment[],
): Set<string> {
  return new Set([
    ...(project.source.kind === "image" ? ["image"] : []),
    ...snapshots.map((snapshot) => `snapshot:${snapshot.id}`),
    ...comments.flatMap((comment) => (comment.crop ? [`crop:${comment.id}`] : [])),
  ]);
}

const items = <T>(rows: readonly Sequenced<T>[]) => rows.map((row) => row.item);

async function currentKeys(store: ShareStore, share: ShareRecord): Promise<Set<string>> {
  const [snapshots, comments] = await Promise.all([
    store.snapshots(share.id),
    store.comments(share.id),
  ]);
  return referencedKeys(share.project, items(snapshots), items(comments));
}

/** Referenced blobs not stored yet: what the owner should upload next. */
async function missingBlobs(store: ShareStore, share: ShareRecord): Promise<string[]> {
  const [referenced, stored] = await Promise.all([
    currentKeys(store, share),
    store.blobSizes(share.id),
  ]);
  const have = new Set(stored.map((blob) => blob.key));
  return [...referenced].filter((key) => !have.has(key)).sort();
}

/** Stored blobs nothing points at any more, deleted along with their files. */
async function dropUnreferenced({ store, blobs }: ShareServices, share: ShareRecord) {
  const [referenced, stored] = await Promise.all([
    currentKeys(store, share),
    store.blobSizes(share.id),
  ]);
  const stale = stored.map((blob) => blob.key).filter((key) => !referenced.has(key));
  await blobs.discard(await store.deleteBlobs(share.id, stale));
}

/** Checks size limits and the image type, then stores the bytes under `key`. */
async function storeBlob(
  { store, blobs }: ShareServices,
  share: ShareRecord,
  key: string,
  bytes: Uint8Array,
): Promise<Outcome<{ key: string; size: number }>> {
  const kind: BlobKind = blobKind(key);
  if (bytes.length === 0) return fail(400, "empty");
  if (bytes.length > SHARE_LIMITS.blobBytes[kind]) return fail(413, "too-large");
  const contentType = sniffImageType(bytes);
  if (!contentType) return fail(415, "not-an-image");
  const sizes = await store.blobSizes(share.id);
  const others = sizes.filter((blob) => blob.key !== key).reduce((sum, blob) => sum + blob.size, 0);
  if (others + bytes.length > SHARE_LIMITS.totalBytes) return fail(413, "share-full");
  const previous = await store.getBlob(share.id, key);
  const location = await blobs.save(share.id, key, bytes, contentType);
  await store.putBlob(share.id, { key, contentType, size: bytes.length, location });
  if (previous) await blobs.discard([previous.location]);
  return ok({ key, size: bytes.length });
}

// ── Owner ──────────────────────────────────────────────────────────────────

export async function createShare(
  services: ShareServices,
  state: ShareState,
  now: number,
): Promise<CreatedShare> {
  const { store } = services;
  const token = createSecret();
  const ownerKey = createSecret();
  const share: ShareRecord = {
    id: createShareId(),
    tokenHash: hashSecret(token),
    ownerKeyHash: hashSecret(ownerKey),
    project: state.project,
    createdAt: now,
    updatedAt: now,
  };
  await store.create(share);
  for (const snapshot of state.snapshots) await store.upsertSnapshot(share.id, snapshot, "owner");
  for (const comment of state.comments) await store.upsertComment(share.id, comment, "owner");
  return { shareId: share.id, token, ownerKey, missingBlobs: await missingBlobs(store, share) };
}

/** Of `ids`, the rows the owner may delete: its own, and client rows it has pulled (seq ≤ cursor). */
function deletable<T extends { id: string }>(
  rows: readonly Sequenced<T>[],
  ids: readonly string[],
  cursor: number,
): string[] {
  const wanted = new Set(ids);
  return rows
    .filter((row) => wanted.has(row.item.id) && (row.origin === "owner" || row.seq <= cursor))
    .map((row) => row.item.id);
}

/** How many rows remain after upserting and deleting. */
function countAfter<T extends { id: string }>(
  rows: readonly Sequenced<T>[],
  upserts: readonly T[],
  deletes: readonly string[],
): number {
  const ids = new Set(rows.map((row) => row.item.id));
  for (const item of upserts) ids.add(item.id);
  for (const deleted of deletes) ids.delete(deleted);
  return ids.size;
}

/** What the server holds, by content digest, plus the images it still lacks. */
export async function shareManifest(store: ShareStore, share: ShareRecord): Promise<ShareManifest> {
  const [snapshots, comments] = await Promise.all([
    store.snapshots(share.id),
    store.comments(share.id),
  ]);
  const digests = <T extends { id: string }>(rows: readonly Sequenced<T>[]) =>
    rows.map((row) => ({ id: row.item.id, digest: digest(row.item) }));
  return {
    project: digest(share.project),
    snapshots: digests(snapshots),
    comments: digests(comments),
    missingBlobs: await missingBlobs(store, share),
  };
}

/**
 * Applies one batch of the owner's changes. The owner wins on everything it
 * sends; deletes reach only rows it has seen, so client additions it hasn't
 * pulled yet survive. A share holds at most 200 snapshots and 1000 comments.
 */
export async function applyChanges(
  services: ShareServices,
  share: ShareRecord,
  change: ShareChange,
  now: number,
): Promise<Outcome<{ missingBlobs: string[] }>> {
  const { store } = services;
  const [snapshots, comments] = await Promise.all([
    store.snapshots(share.id),
    store.comments(share.id),
  ]);
  const deleteSnapshots = deletable(snapshots, change.deleteSnapshots, change.cursor);
  const deleteComments = deletable(comments, change.deleteComments, change.cursor);
  if (
    countAfter(snapshots, change.snapshots, deleteSnapshots) > SHARE_LIMITS.snapshots ||
    countAfter(comments, change.comments, deleteComments) > SHARE_LIMITS.comments
  ) {
    return fail(413, "share-full");
  }
  if (change.project) await store.setProject(share.id, change.project, now);
  for (const snapshot of change.snapshots) await store.upsertSnapshot(share.id, snapshot, "owner");
  for (const comment of change.comments) await store.upsertComment(share.id, comment, "owner");
  await store.deleteSnapshots(share.id, deleteSnapshots);
  await store.deleteComments(share.id, deleteComments);
  const updated = change.project ? { ...share, project: change.project } : share;
  await dropUnreferenced(services, updated);
  return ok({ missingBlobs: await missingBlobs(store, updated) });
}

/** Client additions after `since`, in order, with the cursor to ask from next time. */
export async function pullChanges(
  store: ShareStore,
  share: ShareRecord,
  since: number,
): Promise<ShareChanges> {
  const [snapshots, comments] = await Promise.all([
    store.snapshots(share.id),
    store.comments(share.id),
  ]);
  const fresh = <T>(rows: readonly Sequenced<T>[]) =>
    rows.filter((row) => row.origin === "client" && row.seq > since);
  const newSnapshots = fresh(snapshots);
  const newComments = fresh(comments);
  const cursor = Math.max(since, ...[...newSnapshots, ...newComments].map((row) => row.seq));
  return { snapshots: items(newSnapshots), comments: items(newComments), cursor };
}

export interface UploadProgress {
  key: string;
  /** True once the whole image is stored. */
  complete: boolean;
  /** Bytes received so far (the whole image once complete). */
  size: number;
}

function joinParts(parts: ReadonlyArray<{ bytes: Uint8Array }>): Uint8Array {
  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.bytes.length, 0));
  let offset = 0;
  for (const { bytes } of parts) {
    joined.set(bytes, offset);
    offset += bytes.length;
  }
  return joined;
}

/**
 * An owner upload, whole (`parts` 1) or as part `part` of `parts`, each at
 * most `SHARE_LIMITS.transferBytes`. Parts are kept until the last one
 * arrives, then joined and checked like a whole upload. Part 0 starts over.
 * Only blobs the share's data points at are accepted.
 */
export async function putOwnerBlob(
  services: ShareServices,
  share: ShareRecord,
  key: string,
  bytes: Uint8Array,
  { part, parts }: { part: number; parts: number } = { part: 0, parts: 1 },
): Promise<Outcome<UploadProgress>> {
  const { store } = services;
  if (!(await currentKeys(store, share)).has(key)) return fail(422, "not-referenced");
  const limit = SHARE_LIMITS.blobBytes[blobKind(key)];
  const maxParts = Math.ceil(limit / SHARE_LIMITS.transferBytes);
  if (!(parts >= 1 && parts <= maxParts && part >= 0 && part < parts)) return fail(400, "bad-part");
  if (bytes.length > SHARE_LIMITS.transferBytes) return fail(413, "too-large");
  if (parts === 1) {
    const stored = await storeBlob(services, share, key, bytes);
    return stored.ok ? ok({ key, complete: true, size: stored.value.size }) : stored;
  }
  if (part === 0) await store.deleteBlobParts(share.id, key);
  await store.putBlobPart(share.id, key, part, bytes);
  const received = await store.blobParts(share.id, key);
  const size = received.reduce((sum, entry) => sum + entry.bytes.length, 0);
  if (size > limit) {
    await store.deleteBlobParts(share.id, key);
    return fail(413, "too-large");
  }
  const complete =
    received.length === parts && received.every((entry, index) => entry.part === index);
  if (!complete) return ok({ key, complete: false, size });
  await store.deleteBlobParts(share.id, key);
  const stored = await storeBlob(services, share, key, joinParts(received));
  return stored.ok ? ok({ key, complete: true, size: stored.value.size }) : stored;
}

/** Deletes the share, its rows and its blob files. The link stops working at once. */
export async function revokeShare({ store, blobs }: ShareServices, share: ShareRecord) {
  await blobs.discard(await store.remove(share.id));
}

// ── Reads (owner and client) ───────────────────────────────────────────────

export async function readBlob(
  { store, blobs }: ShareServices,
  share: ShareRecord,
  key: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const stored = await store.getBlob(share.id, key);
  if (!stored) return null;
  const bytes = await blobs.read(stored.location);
  return bytes ? { bytes, contentType: stored.contentType } : null;
}

export async function clientView(store: ShareStore, share: ShareRecord): Promise<ClientView> {
  const [snapshots, comments] = await Promise.all([
    store.snapshots(share.id),
    store.comments(share.id),
  ]);
  return { project: share.project, snapshots: items(snapshots), comments: items(comments) };
}

// ── Client writes ──────────────────────────────────────────────────────────

/**
 * A client's comment: always active, timestamped by the server, immutable for
 * clients afterwards (an id that's taken is refused). Its crop, when sent,
 * must come with the rect it shows.
 */
export async function addClientComment(
  services: ShareServices,
  share: ShareRecord,
  input: ClientCommentInput,
  crop: Uint8Array | null,
  now: number,
): Promise<Outcome<SharedComment>> {
  const { store } = services;
  if (Boolean(crop) !== Boolean(input.crop)) return fail(400, "crop-mismatch");
  if (input.snapshotId) {
    const snapshots = await store.snapshots(share.id);
    if (!snapshots.some((row) => row.item.id === input.snapshotId)) {
      return fail(422, "unknown-snapshot");
    }
  }
  if (crop) {
    if (crop.length > SHARE_LIMITS.blobBytes.crop) return fail(413, "too-large");
    if (!sniffImageType(crop)) return fail(415, "not-an-image");
  }
  // Taken ids are refused before anything is stored, so a crop never overwrites another's.
  const existing = await store.comments(share.id);
  if (existing.some((row) => row.item.id === input.id)) return fail(409, "exists");
  if (existing.length >= SHARE_LIMITS.comments) return fail(413, "share-full");
  // The crop is stored first: if it doesn't fit (share full) or storage fails, no row exists,
  // so a retry gets the same real error, and no comment ever points at a missing image.
  if (crop) {
    const stored = await storeBlob(services, share, `crop:${input.id}`, crop);
    if (!stored.ok) return stored;
  }
  const comment: SharedComment = { ...input, status: "active", createdAt: now, updatedAt: now };
  if (!(await store.insertComment(share.id, comment, "client"))) return fail(409, "exists");
  return ok(comment);
}

/**
 * Captures the shared project's own address (never one the client sends) and
 * adds it as a snapshot every viewer of the share can comment on.
 */
export async function captureForClient(
  services: ShareServices,
  share: ShareRecord,
  width: number,
  capture: (url: URL, width: number) => Promise<CapturedImage>,
  now: number,
): Promise<Outcome<SharedSnapshot>> {
  const { source } = share.project;
  if (source.kind !== "url") return fail(422, "not-a-website");
  if ((await services.store.snapshots(share.id)).length >= SHARE_LIMITS.snapshots) {
    return fail(413, "share-full");
  }
  const image = await capture(new URL(source.url), width);
  const snapshot: SharedSnapshot = {
    id: randomUUID(),
    width: image.width,
    height: image.height,
    createdAt: now,
    sourceUrl: source.url,
    ...(image.scale < 1 ? { scale: image.scale } : {}),
  };
  await services.store.upsertSnapshot(share.id, snapshot, "client");
  const stored = await storeBlob(services, share, `snapshot:${snapshot.id}`, image.body);
  if (!stored.ok) {
    await services.store.deleteSnapshots(share.id, [snapshot.id]);
    return stored;
  }
  return ok(snapshot);
}
