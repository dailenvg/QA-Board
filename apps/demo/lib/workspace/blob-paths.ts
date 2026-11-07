import { WORKSPACE_LIMITS } from "./limits";

/**
 * Where a workspace file is stored: `ws/<workspaceId>/project/<projectId>/<kind>/<id>`,
 * built on the server only, from the workspace the session belongs to and a
 * logical key (`page:<id>`, as the browser names files). Fixed, so an upload
 * can never land anywhere else and a retry finds the same file. Browsers and
 * guests only ever see the logical key.
 */

export const BLOB_KINDS = ["page", "image", "snapshot", "crop"] as const;
export type BlobKind = (typeof BLOB_KINDS)[number];

/** Everything a workspace stores sits under this prefix (`lib/share` uses `squint/`). */
export const WORKSPACE_BLOB_PREFIX = "ws/";

const SEGMENT = "[A-Za-z0-9_-]{1,64}";
const KEY = new RegExp(`^(${BLOB_KINDS.join("|")}):(${SEGMENT})$`);
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH = new RegExp(
  `^ws/(${UUID})/project/(${SEGMENT})/(${BLOB_KINDS.join("|")})/(${SEGMENT})$`,
);

export function parseBlobKey(key: string): { kind: BlobKind; id: string } | null {
  const match = KEY.exec(key);
  return match?.[1] && match[2] ? { kind: match[1] as BlobKind, id: match[2] } : null;
}

export function blobPath(workspaceId: string, projectId: string, key: string): string {
  const parsed = parseBlobKey(key);
  const path = parsed && `ws/${workspaceId}/project/${projectId}/${parsed.kind}/${parsed.id}`;
  if (!path || !PATH.test(path)) throw new Error("Not a workspace blob path.");
  return path;
}

/** The parts of a project file's path; null for anything else (a logo, another app's file). */
export function parseBlobPath(
  path: string,
): { workspaceId: string; projectId: string; key: string } | null {
  const match = PATH.exec(path);
  if (!match?.[1] || !match[2] || !match[3] || !match[4]) return null;
  return { workspaceId: match[1], projectId: match[2], key: `${match[3]}:${match[4]}` };
}

/** The prefix of every file of one project, for cleanup after it's deleted. */
export function projectBlobPrefix(workspaceId: string, projectId: string): string {
  return `ws/${workspaceId}/project/${projectId}/`;
}

/** The largest file a key may hold. */
export function blobLimit(key: string): number {
  const kind = parseBlobKey(key)?.kind ?? "crop";
  return WORKSPACE_LIMITS.blobBytes[kind];
}
