import { call, jsonInit, type ApiResult } from "../share-client/api";
import { workspaceBlobUrl } from "./blob-source";
import { connectedWorkspaceId, whenSaved, workspaceBlobs } from "./workspace-store";

/**
 * Puts a file into a workspace. With Vercel Blob: a client token from
 * `blobs/token` for the file's fixed path, the upload straight to the store,
 * then `blobs/commit`. Without it (local development and e2e), the server
 * answers the token request with 409 `inline-uploads`, and the bytes go to the
 * file's own route instead; that answer is remembered for the visit.
 */

export type UploadResult = { ok: true } | { ok: false; status: number; error: string };

const DONE: UploadResult = { ok: true };

/** Learned from the first token request: this server stores files itself. */
let inline = false;

function settled(result: ApiResult<unknown>): UploadResult {
  return result.ok ? DONE : result;
}

/** The store path the server builds for a key: `ws/<workspace>/project/<project>/<kind>/<id>`. */
function storePath(workspaceId: string, projectId: string, key: string): string {
  const [kind, id] = key.split(":");
  return `ws/${workspaceId}/project/${projectId}/${kind}/${id}`;
}

function putInline(workspaceId: string, projectId: string, key: string, blob: Blob) {
  return call(workspaceBlobUrl(workspaceId, projectId, key), {
    method: "PUT",
    headers: { "content-type": blob.type || "application/octet-stream" },
    body: blob,
  });
}

async function putToStore(pathname: string, blob: Blob, clientToken: string): Promise<boolean> {
  try {
    const { put } = await import("@vercel/blob/client");
    await put(pathname, blob, { access: "private", token: clientToken, contentType: blob.type });
    return true;
  } catch {
    return false;
  }
}

/** Uploads `blob` as the project's file `key`. Uploading a key the workspace already has succeeds. */
export async function uploadWorkspaceBlob(
  workspaceId: string,
  projectId: string,
  key: string,
  blob: Blob,
): Promise<UploadResult> {
  if (inline) return settled(await putInline(workspaceId, projectId, key, blob));
  const base = `/api/w/${encodeURIComponent(workspaceId)}/blobs`;
  const pathname = storePath(workspaceId, projectId, key);
  const clientPayload = JSON.stringify({ projectId, key, size: blob.size, contentType: blob.type });
  const token = await call<{ clientToken: string }>(
    `${base}/token`,
    jsonInit("POST", {
      type: "blob.generate-client-token",
      payload: { pathname, clientPayload, multipart: false },
    }),
  );
  if (!token.ok) {
    if (token.status === 409 && token.error === "inline-uploads") {
      inline = true;
      return settled(await putInline(workspaceId, projectId, key, blob));
    }
    return token.status === 409 && token.error === "exists" ? DONE : token;
  }
  if (!(await putToStore(pathname, blob, token.value.clientToken))) {
    return { ok: false, status: 0, error: "upload" };
  }
  return settled(await call(`${base}/commit`, jsonInit("POST", { projectId, key })));
}

/**
 * Shows `blob` at once, then uploads it as `key` of `projectId` once every
 * change queued before it is saved (so the project exists on the server).
 */
export async function storeWorkspaceBlob(
  projectId: string,
  key: string,
  blob: Blob,
): Promise<UploadResult> {
  const workspaceId = connectedWorkspaceId();
  if (!workspaceId) return { ok: false, status: 0, error: "not-connected" };
  workspaceBlobs()?.hold(key, blob);
  await whenSaved();
  return uploadWorkspaceBlob(workspaceId, projectId, key, blob);
}

/** Deletes a project's file nothing points at any more. Best effort: a leftover only costs space. */
export async function discardWorkspaceBlob(projectId: string, key: string): Promise<void> {
  const workspaceId = connectedWorkspaceId();
  if (workspaceId)
    await call(workspaceBlobUrl(workspaceId, projectId, key), jsonInit("DELETE", {}));
}
