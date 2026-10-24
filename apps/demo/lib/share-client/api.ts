import { OWNER_KEY_HEADER } from "../share/http-headers";
import type {
  ClientView,
  CreatedShare,
  SharedComment,
  SharedSnapshot,
  ShareChanges,
  ShareState,
} from "../share/types";
import type { ProjectShare } from "../store/types";
import { fetchInRanges, uploadParts } from "./transfer";

/** `status` 0 means the request never got an answer (offline, aborted). */
export type ApiResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

async function call<T>(input: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(input, { cache: "no-store", ...init });
  } catch {
    return { ok: false, status: 0, error: "offline" };
  }
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.ok) return { ok: true, value: body as T };
  const error =
    typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
      ? body.error
      : "failed";
  return { ok: false, status: response.status, error };
}

const jsonInit = (method: string, body: unknown, headers: Record<string, string> = {}) => ({
  method,
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

const owner = (share: ProjectShare) => ({ [OWNER_KEY_HEADER]: share.ownerKey });
const blobPath = (key: string) => encodeURIComponent(key);

/** The owner's calls: everything needs the owner key. */
export const ownerApi = {
  create: (state: ShareState) => call<CreatedShare>("/api/shares", jsonInit("POST", state)),
  push: (share: ProjectShare, state: ShareState) =>
    call<{ missingBlobs: string[] }>(
      `/api/shares/${share.id}`,
      jsonInit("PUT", { state, cursor: share.cursor }, owner(share)),
    ),
  /** Uploads in parts of at most 4 MB; resolves with the last part's answer. */
  async upload(share: ProjectShare, key: string, blob: Blob) {
    const parts = uploadParts(blob);
    let result: ApiResult<{ key: string; complete: boolean; size: number }> = {
      ok: false,
      status: 0,
      error: "empty",
    };
    for (const [part, body] of parts.entries()) {
      result = await call(
        `/api/shares/${share.id}/blobs/${blobPath(key)}?part=${part}&parts=${parts.length}`,
        { method: "PUT", headers: owner(share), body },
      );
      if (!result.ok) return result;
    }
    return result;
  },
  pull: (share: ProjectShare) =>
    call<ShareChanges>(`/api/shares/${share.id}/changes?since=${share.cursor}`, {
      headers: owner(share),
    }),
  download: (share: ProjectShare, key: string) =>
    fetchInRanges(`/api/shares/${share.id}/blobs/${blobPath(key)}`, { headers: owner(share) }),
  revoke: (share: ProjectShare) =>
    call<null>(`/api/shares/${share.id}`, { method: "DELETE", headers: owner(share) }),
};

/** A shared link's calls, by its token. */
export function clientApi(token: string) {
  const base = `/api/s/${encodeURIComponent(token)}`;
  return {
    view: () => call<ClientView>(base),
    blobUrl: (key: string) => `${base}/blobs/${blobPath(key)}`,
    addComment: (form: FormData) =>
      call<SharedComment>(`${base}/comments`, { method: "POST", body: form }),
    capture: (width: number, signal: AbortSignal) =>
      call<SharedSnapshot>(`${base}/capture`, { ...jsonInit("POST", { width }), signal }),
  };
}

/** The address clients open. */
export function shareUrl(token: string): string {
  return `${window.location.origin}/s/${token}`;
}
