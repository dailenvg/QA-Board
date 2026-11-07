import { createHmac } from "node:crypto";
import type * as BlobModule from "@vercel/blob";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import { addFolder, NOW, twoWorkspaces, URL_PROJECT, type Seat } from "@/test/workspace-fixture";
import { call } from "@/test/workspace-routes";
import type { Database } from "../db/database";
import { blobPath } from "./blob-paths";
import { storageSummary } from "./blobs";
import { createProject } from "./projects";

/**
 * Vercel Blob's completion callback reaches `blobs/token` without a session
 * (middleware lets that one path through). Only a body signed with the
 * store's token may commit anything, and only for the URL's workspace.
 */

const TOKEN = "vercel_blob_rw_teststore_0123456789abcdef";
const SIZE = 1234;

const holder = vi.hoisted(() => ({ db: null as Database | null, head: vi.fn() }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

vi.mock("@vercel/blob", async (importOriginal) => ({
  ...(await importOriginal<typeof BlobModule>()),
  head: holder.head,
}));

let db: Database;
let a: Seat;
let b: Seat;

beforeEach(async () => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", TOKEN);
  vi.stubEnv("VERCEL", "");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  ({ db, a, b } = await twoWorkspaces());
  holder.db = db;
  holder.head.mockReset();
  holder.head.mockImplementation((pathname: string) =>
    Promise.resolve({
      url: `https://store.test/${pathname}`,
      size: SIZE,
      contentType: "image/png",
    }),
  );
  await addFolder(db, a.workspaceId);
  await createProject(db, a.workspaceId, URL_PROJECT("p1"), NOW);
});

/** The callback the store sends once `key` is uploaded, for the upload `payloadWorkspace` was granted. */
function callback(payloadWorkspace: string, key = "snapshot:s1") {
  const pathname = blobPath(payloadWorkspace, "p1", key);
  return {
    type: "blob.upload-completed",
    payload: {
      blob: {
        url: `https://store.test/${pathname}`,
        downloadUrl: `https://store.test/${pathname}?download=1`,
        pathname,
        contentType: "image/png",
        contentDisposition: 'inline; filename="s1"',
        etag: '"abc"',
      },
      tokenPayload: JSON.stringify({ workspaceId: payloadWorkspace, projectId: "p1", key }),
    },
  };
}

const sign = (body: string, token = TOKEN) =>
  createHmac("sha256", token).update(body).digest("hex");

function send(workspaceId: string, body: unknown, signature?: string) {
  const text = JSON.stringify(body);
  return call("POST", `/api/w/${workspaceId}/blobs/token`, {
    body: text,
    headers: {
      origin: "",
      ...(signature === undefined ? {} : { "x-vercel-signature": signature }),
    },
  });
}

async function rows() {
  const { rows: found } = await db.query("SELECT workspace_id, key, size FROM workspace_blobs");
  return found;
}

describe("the upload callback", () => {
  it("needs a session without a signature: it's a token request then", async () => {
    const response = await send(a.workspaceId, callback(a.workspaceId));
    expect(response.status).toBe(401);
    expect(await rows()).toEqual([]);
  });

  it("refuses a forged signature, committing nothing", async () => {
    const body = callback(a.workspaceId);
    for (const signature of ["00".repeat(32), sign(JSON.stringify(body), "another-token"), "x"]) {
      const response = await send(a.workspaceId, body, signature);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid-callback" });
    }
    expect(holder.head).not.toHaveBeenCalled();
    expect(await rows()).toEqual([]);
  });

  it("refuses a validly signed payload for another workspace than the URL's", async () => {
    const body = callback(b.workspaceId);
    const response = await send(a.workspaceId, body, sign(JSON.stringify(body)));
    expect(response.status).toBe(400);
    expect(holder.head).not.toHaveBeenCalled();
    expect(await rows()).toEqual([]);
  });

  it("commits a valid callback once, however often it's replayed", async () => {
    const body = callback(a.workspaceId);
    const signature = sign(JSON.stringify(body));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await send(a.workspaceId, body, signature);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    }
    expect(await rows()).toEqual([
      {
        workspace_id: a.workspaceId,
        key: blobPath(a.workspaceId, "p1", "snapshot:s1"),
        size: expect.anything() as unknown,
      },
    ]);
    expect(await storageSummary(db, a.workspaceId)).toMatchObject({ bytes: SIZE, blobCount: 1 });
  });

  it("answers a JSON 503 when Vercel Blob isn't configured on Vercel", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("VERCEL", "1");
    const body = callback(a.workspaceId);
    const response = await send(a.workspaceId, body, sign(JSON.stringify(body)));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "not-configured" });
  });
});
