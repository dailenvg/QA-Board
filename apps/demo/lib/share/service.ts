import { randomUUID } from "node:crypto";
import type { CapturedImage } from "../capture/capture-page";
import type { ShareServices } from "./server";
import { blobKind, SHARE_LIMITS, type BlobKind } from "./schemas";
import { sniffImageType } from "./sniff";
import type { ShareStore } from "./store";
import { createSecret, createShareId, hashSecret, isSecretShape, secretMatches } from "./tokens";
import { digest } from "./digest";
import { pageBlobKey } from "./keys";
import { isExpired, rescheduledExpiry, shareExpiresAt } from "./retention";
import { pageAddress, sameSite } from "../page-address";
import { reviewClosed, reviewDeadline } from "./review-window";
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

export type Failure = {
  ok: false;
  status: 400 | 403 | 404 | 409 | 413 | 415 | 422;
  error: string;
};
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

/**
 * The share while it's live at `now`: an expired one is gone at once, even
 * before the daily cron deletes it, and answers exactly like a revoked one.
 */
function live(share: ShareRecord | null, now: number): ShareRecord | null {
  return share && !isExpired(share.expiresAt, now) ? share : null;
}

/**
 * The share, if `ownerKey` is its owner key and it hasn't expired at `now`.
 * Unknown, revoked, expired and wrong key all look the same.
 */
export async function ownerShare(
  store: ShareStore,
  shareId: string,
  ownerKey: string | null,
  now: number,
): Promise<ShareRecord | null> {
  if (!ownerKey || !isSecretShape(ownerKey)) return null;
  const share = await store.byId(shareId);
  return share && secretMatches(ownerKey, share.ownerKeyHash) ? live(share, now) : null;
}

/** The share a client link opens at `now`. Unknown, revoked and expired tokens look the same. */
export async function clientShare(
  store: ShareStore,
  token: string,
  now: number,
): Promise<ShareRecord | null> {
  if (!isSecretShape(token)) return null;
  const share = await store.byTokenHash(hashSecret(token));
  return share && secretMatches(token, share.tokenHash) ? live(share, now) : null;
}

// ── Blob bookkeeping ───────────────────────────────────────────────────────

/** Where a comment row's crop is stored: its claim's key, else `crop:<id>`. */
function cropKeyOfRow(row: Sequenced<SharedComment>): string | null {
  return row.item.crop ? (row.cropKey ?? `crop:${row.item.id}`) : null;
}

/** Every blob key the share's data points at (comments' crops where their rows say). */
export function referencedKeys(
  project: SharedProject,
  snapshots: readonly SharedSnapshot[],
  comments: readonly Sequenced<SharedComment>[],
): Set<string> {
  const { source } = project;
  return new Set([
    ...(source.kind === "pages" ? source.pages.map((page) => pageBlobKey(page.id, page.rev)) : []),
    ...snapshots.map((snapshot) => `snapshot:${snapshot.id}`),
    ...comments.flatMap((row) => cropKeyOfRow(row) ?? []),
  ]);
}

/** Keys the owner can upload (a client's per-claim crop keys aren't among them). */
const OWNER_UPLOADABLE =
  /^(page:[A-Za-z0-9_-]{1,64}(:\d{1,9})?|(snapshot|crop):[A-Za-z0-9_-]{1,64})$/;

const items = <T>(rows: readonly Sequenced<T>[]) => rows.map((row) => row.item);

async function currentKeys(store: ShareStore, share: ShareRecord): Promise<Set<string>> {
  const [snapshots, comments] = await Promise.all([
    store.snapshots(share.id),
    store.comments(share.id),
  ]);
  return referencedKeys(share.project, items(snapshots), comments);
}

/** Referenced blobs not stored yet: what the owner should upload next. */
async function missingBlobs(store: ShareStore, share: ShareRecord): Promise<string[]> {
  const [referenced, stored] = await Promise.all([
    currentKeys(store, share),
    store.blobSizes(share.id),
  ]);
  const have = new Set(stored.map((blob) => blob.key));
  return [...referenced].filter((key) => OWNER_UPLOADABLE.test(key) && !have.has(key)).sort();
}

/**
 * Stored blobs nothing points at any more, deleted along with their files.
 * Pending snapshots and comments count, so an image stored a moment before its
 * row is confirmed is never swept.
 */
async function dropUnreferenced({ store, blobs }: ShareServices, share: ShareRecord) {
  const [snapshots, comments, stored] = await Promise.all([
    store.snapshots(share.id, { includePending: true }),
    store.comments(share.id, { includePending: true }),
    store.blobSizes(share.id),
  ]);
  const referenced = referencedKeys(share.project, items(snapshots), comments);
  const stale = stored.map((blob) => blob.key).filter((key) => !referenced.has(key));
  await blobs.discard(await store.deleteBlobs(share.id, stale));
}

/** Checks size limits and the image type, then stores the bytes under `key`. */
async function storeBlob(
  { store, blobs }: ShareServices,
  share: ShareRecord,
  key: string,
  bytes: Uint8Array,
  signal?: AbortSignal,
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
  const location = await blobs.save(share.id, key, bytes, contentType, signal);
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
    expiresAt: shareExpiresAt(state.project, now),
  };
  await store.create(share);
  for (const snapshot of state.snapshots) await store.upsertSnapshot(share.id, snapshot, "owner");
  for (const comment of state.comments) await store.upsertComment(share.id, comment, "owner");
  return {
    shareId: share.id,
    token,
    ownerKey,
    missingBlobs: await missingBlobs(store, share),
    expiresAt: share.expiresAt,
  };
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
    expiresAt: share.expiresAt,
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
  if (change.project) {
    // Retention counts from the project's creation once it says when that was (see `retention.ts`).
    const expiresAt = rescheduledExpiry(share.expiresAt, change.project, share.createdAt, now);
    await store.setProject(share.id, change.project, now, expiresAt);
  }
  for (const snapshot of change.snapshots) await store.upsertSnapshot(share.id, snapshot, "owner");
  for (const comment of change.comments) await store.upsertComment(share.id, comment, "owner");
  await store.deleteSnapshots(share.id, deleteSnapshots);
  await store.deleteComments(share.id, deleteComments);
  const updated = change.project ? { ...share, project: change.project } : share;
  await store.deleteStalePending(share.id, now - PENDING_STALE_MS);
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
  return {
    snapshots: items(newSnapshots),
    comments: items(newComments),
    cursor,
    expiresAt: share.expiresAt,
  };
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
export async function revokeShare({ store, blobs }: ShareServices, share: Pick<ShareRecord, "id">) {
  await blobs.discard(await store.remove(share.id));
}

// ── Reads (owner and client) ───────────────────────────────────────────────

export async function readBlob(
  { store, blobs }: ShareServices,
  share: ShareRecord,
  key: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  // `crop:<id>` is a comment's public crop key; its row says where the bytes really are.
  const comment = /^crop:([A-Za-z0-9_-]+)$/.exec(key)?.[1];
  const resolved = (comment && (await store.cropKeyOf(share.id, comment))) || key;
  const stored = await store.getBlob(share.id, resolved);
  if (!stored) return null;
  const bytes = await blobs.read(stored.location);
  return bytes ? { bytes, contentType: stored.contentType } : null;
}

export async function clientView(store: ShareStore, share: ShareRecord): Promise<ClientView> {
  const [snapshots, comments] = await Promise.all([
    store.snapshots(share.id),
    store.comments(share.id),
  ]);
  return {
    project: share.project,
    snapshots: items(snapshots),
    comments: items(comments),
    reviewEndsAt: reviewDeadline(share.createdAt),
    expiresAt: share.expiresAt,
  };
}

// ── Client writes ──────────────────────────────────────────────────────────

/** 403 once the share's review window is over: clients can still read, but not add. */
const REVIEW_CLOSED: Failure = fail(403, "review-closed");

/**
 * A pending claim older than this was orphaned (its request died) and may be
 * reclaimed or expired. Well above the comment route's `maxDuration` (30 s), and
 * a live request can't be hurt by it anyway: confirms and cleanups only touch
 * their own claim.
 */
export const PENDING_STALE_MS = 120_000;

/** A crop upload is abandoned after this, well before the route's 30 s deadline. */
export const CROP_UPLOAD_MS = 20_000;

/**
 * Claims a client comment's id by inserting its row (pending under `claim`
 * when it has a crop). On a conflict: a visible row means it was already
 * posted (409 exists, so the client knows it got through); a pending row
 * younger than `PENDING_STALE_MS` is 409 pending (the client keeps its draft
 * and retries); an older pending row was orphaned and is reclaimed: that
 * stale row is deleted atomically and the id claimed again.
 */
async function claimCommentId(
  services: ShareServices,
  share: ShareRecord,
  comment: SharedComment,
  claim: { claim: string; cropKey: string } | undefined,
  now: number,
): Promise<Outcome<undefined>> {
  const { store } = services;
  const insert = () => store.insertComment(share.id, comment, "client", claim);
  if (await insert()) return ok(undefined);
  const since = await store.pendingSince(share.id, comment.id);
  if (since === null) return fail(409, "exists");
  const cutoff = now - PENDING_STALE_MS;
  if (since >= cutoff) return fail(409, "pending");
  const reclaimed = await store.deleteStalePending(share.id, cutoff, comment.id);
  if (reclaimed.length === 0 || !(await insert())) return fail(409, "pending");
  // The orphaned claim's crop (its own key) is unreferenced now.
  await dropUnreferenced(services, share);
  return ok(undefined);
}

/** Deletes one blob a request of ours stored under a key only it uses. */
async function discardBlob({ store, blobs }: ShareServices, share: ShareRecord, key: string) {
  await blobs.discard(await store.deleteBlobs(share.id, [key]));
}

/**
 * Removes pending comments and snapshots orphaned by failed requests (older
 * than `PENDING_STALE_MS`) and the images they left. Runs on owner pulls and changes.
 */
export async function expireStalePending(
  services: ShareServices,
  share: ShareRecord,
  now: number,
): Promise<void> {
  const cutoff = now - PENDING_STALE_MS;
  const [comments, snapshots] = await Promise.all([
    services.store.deleteStalePending(share.id, cutoff),
    services.store.deleteStalePendingSnapshots(share.id, cutoff),
  ]);
  if (comments.length + snapshots.length > 0) await dropUnreferenced(services, share);
}

/**
 * Where a client's comment may sit: a website's comments carry no page; on a
 * page project, a comment on a snapshot carries no page, and every other
 * carries one of the project's pages.
 */
function checkPage(project: SharedProject, input: ClientCommentInput): Failure | null {
  const { source } = project;
  if (source.kind === "url" || input.snapshotId) {
    return input.pageId === undefined ? null : fail(422, "unknown-page");
  }
  return source.pages.some((page) => page.id === input.pageId) ? null : fail(422, "unknown-page");
}

/**
 * A client's comment: always active, timestamped by the server, immutable for
 * clients afterwards (an id that's taken is refused). Its crop, when sent,
 * must come with the rect it shows. Its page must be one of the project's.
 * Refused once the review window is over.
 */
export async function addClientComment(
  services: ShareServices,
  share: ShareRecord,
  input: ClientCommentInput,
  crop: Uint8Array | null,
  now: number,
): Promise<Outcome<SharedComment>> {
  const { store } = services;
  if (reviewClosed(share.createdAt, now)) return REVIEW_CLOSED;
  if (Boolean(crop) !== Boolean(input.crop)) return fail(400, "crop-mismatch");
  const misplaced = checkPage(share.project, input);
  if (misplaced) return misplaced;
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
  const existing = await store.comments(share.id);
  if (existing.length >= SHARE_LIMITS.comments) return fail(413, "share-full");
  const comment: SharedComment = { ...input, status: "active", createdAt: now, updatedAt: now };
  if (!crop) {
    // Without a crop there's nothing to wait for: the row is visible as soon as it's claimed.
    const claimed = await claimCommentId(services, share, comment, undefined, now);
    return claimed.ok ? ok(comment) : claimed;
  }
  // With a crop, the row is claimed pending under a random nonce and its crop goes to a key
  // only this claim uses. Confirming and cleaning up are conditional on the nonce, so an
  // upload that outlives its claim (reclaimed or expired) can never confirm, overwrite or
  // delete anyone else's comment or crop.
  const nonce = randomUUID();
  const cropKey = `crop:${comment.id}:${nonce}`;
  const claimed = await claimCommentId(services, share, comment, { claim: nonce, cropKey }, now);
  if (!claimed.ok) return claimed;
  const undo = async () => {
    await store.deleteClaim(share.id, comment.id, nonce);
    await discardBlob(services, share, cropKey);
  };
  const stored = await storeBlob(
    services,
    share,
    cropKey,
    crop,
    AbortSignal.timeout(CROP_UPLOAD_MS),
  ).catch(async (error: unknown) => {
    await undo();
    throw error;
  });
  if (!stored.ok) {
    // Nothing of this claim stays behind: a retry gets the same real error (such as share-full).
    await undo();
    return stored;
  }
  if (!(await store.confirmComment(share.id, comment.id, nonce))) {
    // The claim was reclaimed or expired while uploading: never report success for it.
    // The client keeps its draft; its retry is confirmed elsewhere (409 exists) or claims anew.
    await discardBlob(services, share, cropKey);
    return fail(409, "pending");
  }
  return ok(comment);
}

/**
 * Captures a page of the shared project's site, `pageUrl` or (when null) the
 * project's own address, and adds it as a snapshot every viewer of the share
 * can comment on. The project's own page is captured at the project's exact
 * address, `#fragment` included (see `pageAddress`), as the owner's are.
 * A page on any other origin is refused before anything is
 * fetched; the capture's own address guard still applies to every page.
 * Refused once the review window is over.
 */
export async function captureForClient(
  services: ShareServices,
  share: ShareRecord,
  width: number,
  capture: (url: URL, width: number) => Promise<CapturedImage>,
  now: number,
  pageUrl: string | null = null,
): Promise<Outcome<SharedSnapshot>> {
  if (reviewClosed(share.createdAt, now)) return REVIEW_CLOSED;
  const { source } = share.project;
  if (source.kind !== "url") return fail(422, "not-a-website");
  const target = pageAddress(pageUrl, source.url);
  if (!target) return fail(422, "other-site");
  if ((await services.store.snapshots(share.id)).length >= SHARE_LIMITS.snapshots) {
    return fail(413, "share-full");
  }
  const image = await capture(new URL(target), width);
  // Another page of the site that redirected off it (an open redirect) isn't the site's page.
  // The project's own address keeps whatever its owner chose, redirects and all.
  if (target !== source.url && image.finalUrl && !sameSite(target, image.finalUrl)) {
    return fail(422, "other-site");
  }
  const snapshot: SharedSnapshot = {
    id: randomUUID(),
    width: image.width,
    height: image.height,
    createdAt: now,
    sourceUrl: target,
    ...(image.scale < 1 ? { scale: image.scale } : {}),
  };
  // Like a comment's crop: the row goes in pending (invisible) first, so cleanup counts the
  // image as referenced from the moment it's stored, and it's confirmed once the image is in.
  // The id is fresh, so the row and the key are this request's alone.
  const { store } = services;
  const key = `snapshot:${snapshot.id}`;
  await store.insertPendingSnapshot(share.id, snapshot);
  const undo = async () => {
    await store.deleteSnapshots(share.id, [snapshot.id]);
    await discardBlob(services, share, key);
  };
  const stored = await storeBlob(services, share, key, image.body).catch(async (error: unknown) => {
    await undo();
    throw error;
  });
  if (!stored.ok) {
    await undo();
    return stored;
  }
  if (!(await store.confirmSnapshot(share.id, snapshot.id))) {
    // Expired while storing (it outlived its route): never report a snapshot that isn't there.
    await undo();
    throw new Error("The snapshot expired before its image was stored.");
  }
  return ok(snapshot);
}
