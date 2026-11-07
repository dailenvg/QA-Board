import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const put = vi.hoisted(() =>
  vi.fn<(pathname: string, blob: Blob, options: object) => Promise<object>>(),
);

vi.mock("@vercel/blob/client", () => ({ put }));

const WORKSPACE = "11111111-2222-4333-8444-555555555555";
const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

/** What the server answers to each `METHOD path`, and every request made. */
let answers: Record<string, Response> = {};
const requests: string[] = [];

beforeEach(() => {
  vi.resetModules();
  requests.length = 0;
  put.mockReset();
  put.mockResolvedValue({});
  vi.stubGlobal("fetch", (input: string, init: RequestInit = {}) => {
    const name = `${init.method ?? "GET"} ${input}`;
    requests.push(name);
    return Promise.resolve(answers[name]?.clone() ?? Response.json({ ok: true }));
  });
});

afterEach(() => {
  answers = {};
  vi.unstubAllGlobals();
});

const TOKEN = `POST /api/w/${WORKSPACE}/blobs/token`;
const COMMIT = `POST /api/w/${WORKSPACE}/blobs/commit`;
const INLINE = `PUT /api/w/${WORKSPACE}/projects/p1/blobs/page%3Ax`;

async function upload() {
  const { uploadWorkspaceBlob } = await import("./blob-upload");
  return uploadWorkspaceBlob(WORKSPACE, "p1", "page:x", blob);
}

describe("uploading a workspace file", () => {
  it("with Vercel Blob: a token for the file's fixed path, the private upload, then the commit", async () => {
    answers[TOKEN] = Response.json({ clientToken: "vercel_blob_client_x" });
    expect(await upload()).toEqual({ ok: true });
    expect(put).toHaveBeenCalledWith(`ws/${WORKSPACE}/project/p1/page/x`, blob, {
      access: "private",
      token: "vercel_blob_client_x",
      contentType: "image/png",
    });
    expect(requests).toEqual([TOKEN, COMMIT]);
  });

  it("without it: through the file's own route, remembered for the rest of the visit", async () => {
    answers[TOKEN] = Response.json({ error: "inline-uploads" }, { status: 409 });
    const { uploadWorkspaceBlob } = await import("./blob-upload");
    expect(await uploadWorkspaceBlob(WORKSPACE, "p1", "page:x", blob)).toEqual({ ok: true });
    expect(await uploadWorkspaceBlob(WORKSPACE, "p1", "page:x", blob)).toEqual({ ok: true });
    expect(requests).toEqual([TOKEN, INLINE, INLINE]);
    expect(put).not.toHaveBeenCalled();
  });

  it("counts a file the workspace already has as uploaded, and reports a refusal", async () => {
    answers[TOKEN] = Response.json({ error: "exists" }, { status: 409 });
    expect(await upload()).toEqual({ ok: true });
    answers[TOKEN] = Response.json({ error: "quota" }, { status: 413 });
    expect(await upload()).toEqual({ ok: false, status: 413, error: "quota" });
  });

  it("reports an upload the store refused, without committing it", async () => {
    answers[TOKEN] = Response.json({ clientToken: "vercel_blob_client_x" });
    put.mockRejectedValue(new Error("network"));
    expect(await upload()).toEqual({ ok: false, status: 0, error: "upload" });
    expect(requests).toEqual([TOKEN]);
  });
});
