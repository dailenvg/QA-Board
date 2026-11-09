import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import type * as BlobDriverModule from "@/lib/workspace/blob-driver";
import { callAccount } from "@/test/account-routes";
import { insertUser } from "@/test/accounts-fixture";
import { jpegHeader, pngHeader, webpLossy } from "@/test/image-headers";
import { seat, type Seat } from "@/test/workspace-fixture";
import { migratedPglite } from "@/test/pglite";
import { createSession } from "../auth/sessions";
import type { Database } from "../db/database";
import type { BlobLocation } from "../share/types";

const holder = vi.hoisted(() => ({
  db: null as Database | null,
  driver: null as object | null,
}));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

vi.mock("@/lib/workspace/blob-driver", async (importOriginal) => {
  const actual = await importOriginal<typeof BlobDriverModule>();
  return { ...actual, blobDriverFromEnv: () => holder.driver ?? actual.blobDriverFromEnv({}) };
});

/** A Vercel Blob store in memory: what was put where, and which URLs were deleted. */
function memoryStore() {
  const files = new Map<string, Uint8Array>();
  const discarded: string[] = [];
  const driver = {
    kind: "vercel" as const,
    read: (location: BlobLocation) =>
      Promise.resolve(location.kind === "vercel" ? (files.get(location.url) ?? null) : null),
    discard: (locations: readonly BlobLocation[]) => {
      for (const location of locations) {
        if (location.kind === "vercel") {
          discarded.push(location.url);
          files.delete(location.url);
        }
      }
      return Promise.resolve();
    },
    put: (pathname: string, bytes: Uint8Array) => {
      const url = `https://store.test/${pathname}`;
      files.set(url, bytes);
      return Promise.resolve({ kind: "vercel" as const, url });
    },
  };
  holder.driver = driver;
  return { files, discarded };
}

let db: Database;
let a: Seat;
let b: Seat;

beforeEach(async () => {
  holder.driver = null;
  db = await migratedPglite();
  holder.db = db;
  a = await seat(db, "acme");
  b = await seat(db, "bravo");
});

const LOGO = pngHeader(400, 100);
const AVATAR = jpegHeader(256, 256);

function put(path: string, cookie: string, bytes: Uint8Array, type = "image/png") {
  return callAccount("PUT", path, { cookie, body: bytes, headers: { "content-type": type } });
}

async function workspaceRow(workspaceId: string) {
  const { rows } = await db.query<{
    name: string;
    brand_color: string | null;
    from_email_name: string | null;
    logo_blob_key: string | null;
  }>("SELECT name, brand_color, from_email_name, logo_blob_key FROM workspaces WHERE id = $1", [
    workspaceId,
  ]);
  return rows[0];
}

async function usage(workspaceId: string) {
  const { rows } = await db.query<{ bytes: string; blob_count: number }>(
    "SELECT bytes, blob_count FROM storage_usage WHERE workspace_id = $1",
    [workspaceId],
  );
  return { bytes: Number(rows[0]?.bytes), files: rows[0]?.blob_count };
}

async function audit() {
  const { rows } = await db.query<{ action: string; workspace_id: string | null; meta: unknown }>(
    "SELECT action, workspace_id, meta FROM audit_log ORDER BY id",
  );
  return rows;
}

/** A member of `a`'s workspace who doesn't own it, signed in. */
async function member(): Promise<string> {
  const userId = await insertUser(db, "member@acme.test");
  await db.query(
    "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'member')",
    [userId, a.workspaceId],
  );
  return `squint_session=${await createSession(db, userId, Date.now())}`;
}

describe("PATCH /api/account/workspace", () => {
  const settings = { name: "  Acme Studio ", brandColor: "#E03B9D", senderName: "Acme  Team" };

  it("saves the session's workspace only, whatever workspace the body names", async () => {
    const response = await callAccount("PATCH", "/api/account/workspace", {
      cookie: a.cookie,
      body: { ...settings, workspaceId: b.workspaceId, id: b.workspaceId },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: "Acme Studio",
      brandColor: "#e03b9d",
      senderName: "Acme Team",
    });
    expect(await workspaceRow(a.workspaceId)).toMatchObject({
      name: "Acme Studio",
      brand_color: "#e03b9d",
      from_email_name: "Acme Team",
    });
    expect(await workspaceRow(b.workspaceId)).toMatchObject({
      name: "bravo",
      brand_color: null,
      from_email_name: null,
    });
    expect(await audit()).toEqual([
      {
        action: "workspace.settings_changed",
        workspace_id: a.workspaceId,
        meta: { fields: ["name", "brandColor", "senderName"] },
      },
    ]);
  });

  it("records only the fields that changed, and nothing for a save that changes nothing", async () => {
    const body = { name: "acme", brandColor: null, senderName: null };
    expect(
      (await callAccount("PATCH", "/api/account/workspace", { cookie: a.cookie, body })).status,
    ).toBe(200);
    expect(await audit()).toEqual([]);
    await callAccount("PATCH", "/api/account/workspace", {
      cookie: a.cookie,
      body: { ...body, brandColor: "#1157ce" },
    });
    expect((await audit()).map((row) => row.meta)).toEqual([{ fields: ["brandColor"] }]);
  });

  it("refuses values that break the rules, naming the field", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ name: " " }, "name"],
      [{ brandColor: "#e1fd73" }, "brandColor"],
      [{ brandColor: "red" }, "brandColor"],
      [{ senderName: 'The "Team"' }, "senderName"],
      [{ senderName: "x".repeat(65) }, "senderName"],
    ];
    for (const [change, field] of cases) {
      const response = await callAccount("PATCH", "/api/account/workspace", {
        cookie: a.cookie,
        body: { ...settings, ...change },
      });
      expect(response.status, field).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid", field });
    }
    expect(await workspaceRow(a.workspaceId)).toMatchObject({ name: "acme", brand_color: null });
  });

  it("answers 404 for an account in no workspace, and 403 for a member who isn't the owner", async () => {
    const admin = await insertUser(db, "admin@squint.test", "admin");
    const adminCookie = `squint_session=${await createSession(db, admin, Date.now())}`;
    const none = await callAccount("PATCH", "/api/account/workspace", {
      cookie: adminCookie,
      body: settings,
    });
    expect(none.status).toBe(404);
    const notOwner = await callAccount("PATCH", "/api/account/workspace", {
      cookie: await member(),
      body: settings,
    });
    expect(notOwner.status).toBe(403);
    expect(await notOwner.json()).toEqual({ error: "owner-only" });
    expect(await workspaceRow(a.workspaceId)).toMatchObject({ name: "acme" });
  });
});

describe("/api/account/workspace/logo", () => {
  it("stores the logo in the session's workspace, counted in its storage, and serves it to members", async () => {
    const response = await put("/api/account/workspace/logo", a.cookie, LOGO);
    expect(response.status).toBe(200);
    const { version } = (await response.json()) as { version: string };
    expect(version).toMatch(/^[0-9a-f]{16}$/);
    const row = await workspaceRow(a.workspaceId);
    expect(row?.logo_blob_key).toMatch(
      new RegExp(`^ws/${a.workspaceId}/brand/logo/[A-Za-z0-9_-]{16}$`),
    );
    expect(await usage(a.workspaceId)).toEqual({ bytes: LOGO.length, files: 1 });
    expect(await workspaceRow(b.workspaceId)).toMatchObject({ logo_blob_key: null });

    for (const cookie of [a.cookie, await member()]) {
      const served = await callAccount("GET", "/api/account/workspace/logo", {
        cookie,
        search: `?v=${version}`,
      });
      expect(served.status).toBe(200);
      expect(served.headers.get("content-type")).toBe("image/png");
      expect(served.headers.get("cache-control")).toBe("private, max-age=300");
      expect(served.headers.get("x-content-type-options")).toBe("nosniff");
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(LOGO);
    }
    const otherWorkspace = await callAccount("GET", "/api/account/workspace/logo", {
      cookie: b.cookie,
    });
    expect(otherWorkspace.status).toBe(404);
    expect(await audit()).toMatchObject([{ action: "workspace.logo_changed" }]);
  });

  it("deletes the old logo's row and file when a new one replaces it", async () => {
    const { files, discarded } = memoryStore();
    await put("/api/account/workspace/logo", a.cookie, LOGO);
    const first = await workspaceRow(a.workspaceId);
    const replacement = webpLossy(256, 128);
    const response = await put("/api/account/workspace/logo", a.cookie, replacement, "image/webp");
    expect(response.status).toBe(200);
    const second = await workspaceRow(a.workspaceId);
    expect(second?.logo_blob_key).not.toBe(first?.logo_blob_key);
    expect(discarded).toEqual([`https://store.test/${first?.logo_blob_key}`]);
    expect([...files.keys()]).toEqual([`https://store.test/${second?.logo_blob_key}`]);
    const { rows } = await db.query<{ key: string; content_type: string }>(
      "SELECT key, content_type FROM workspace_blobs WHERE workspace_id = $1",
      [a.workspaceId],
    );
    expect(rows).toEqual([{ key: second?.logo_blob_key, content_type: "image/webp" }]);
    expect(await usage(a.workspaceId)).toEqual({ bytes: replacement.length, files: 1 });
  });

  it("refuses a logo over the workspace's quota, and deletes the file it stored", async () => {
    const { files, discarded } = memoryStore();
    await db.query("UPDATE workspaces SET storage_quota_bytes = 10 WHERE id = $1", [a.workspaceId]);
    const response = await put("/api/account/workspace/logo", a.cookie, LOGO);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "quota" });
    expect(discarded).toHaveLength(1);
    expect(files.size).toBe(0);
    expect(await workspaceRow(a.workspaceId)).toMatchObject({ logo_blob_key: null });
  });

  it("goes by the file's bytes, not the type the request claims", async () => {
    const gif = new TextEncoder().encode("GIF89a\x10\x00\x10\x00\x00\x00\x00");
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    for (const bytes of [gif, html]) {
      const response = await put("/api/account/workspace/logo", a.cookie, bytes, "image/png");
      expect(response.status).toBe(415);
      expect(await response.json()).toEqual({ error: "wrong-kind" });
    }
    // A real PNG sent as JPEG is stored as what it is.
    expect((await put("/api/account/workspace/logo", a.cookie, LOGO, "image/jpeg")).status).toBe(
      200,
    );
    const { rows } = await db.query<{ content_type: string }>(
      "SELECT content_type FROM workspace_blobs WHERE workspace_id = $1",
      [a.workspaceId],
    );
    expect(rows).toEqual([{ content_type: "image/png" }]);
  });

  it("refuses a file over 1 MB, and one outside the logo's bounds", async () => {
    const big = new Uint8Array(1_000_001);
    big.set(LOGO);
    const tooLarge = await put("/api/account/workspace/logo", a.cookie, big);
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toEqual({ error: "too-large" });
    for (const bytes of [pngHeader(1024, 512), pngHeader(500, 100), pngHeader(8, 8)]) {
      const response = await put("/api/account/workspace/logo", a.cookie, bytes);
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "wrong-size" });
    }
    expect(await usage(a.workspaceId)).toEqual({ bytes: 0, files: 0 });
  });

  it("takes the logo away, row and file, once; removing none changes nothing", async () => {
    const { files, discarded } = memoryStore();
    await put("/api/account/workspace/logo", a.cookie, LOGO);
    const key = (await workspaceRow(a.workspaceId))?.logo_blob_key;
    const removed = await callAccount("DELETE", "/api/account/workspace/logo", {
      cookie: a.cookie,
    });
    expect(removed.status).toBe(200);
    expect(await workspaceRow(a.workspaceId)).toMatchObject({ logo_blob_key: null });
    expect(discarded).toEqual([`https://store.test/${key}`]);
    expect(files.size).toBe(0);
    expect(await usage(a.workspaceId)).toEqual({ bytes: 0, files: 0 });
    const again = await callAccount("DELETE", "/api/account/workspace/logo", { cookie: a.cookie });
    expect(again.status).toBe(200);
    expect((await audit()).map((row) => row.action)).toEqual([
      "workspace.logo_changed",
      "workspace.logo_removed",
    ]);
  });

  it("lets only the owner change the logo", async () => {
    const cookie = await member();
    expect((await put("/api/account/workspace/logo", cookie, LOGO)).status).toBe(403);
    const removed = await callAccount("DELETE", "/api/account/workspace/logo", { cookie });
    expect(removed.status).toBe(403);
  });

  it("slows down a flood of uploads", async () => {
    const statuses: number[] = [];
    for (let upload = 0; upload < 11; upload += 1) {
      statuses.push((await put("/api/account/workspace/logo", a.cookie, LOGO)).status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe("/api/account/avatar", () => {
  it("stores the session's user's avatar, outside any workspace's storage, and serves it to them", async () => {
    const response = await put("/api/account/avatar", a.cookie, AVATAR, "image/jpeg");
    expect(response.status).toBe(200);
    const { version } = (await response.json()) as { version: string };
    const { rows } = await db.query<{ avatar_blob_key: string | null }>(
      "SELECT avatar_blob_key FROM users WHERE id = $1",
      [a.userId],
    );
    expect(rows[0]?.avatar_blob_key).toMatch(new RegExp(`^user/${a.userId}/avatar/`));
    expect(await usage(a.workspaceId)).toEqual({ bytes: 0, files: 0 });
    const served = await callAccount("GET", "/api/account/avatar", {
      cookie: a.cookie,
      search: `?v=${version}`,
    });
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(AVATAR);
    // Another user has none of their own, and can't name this one.
    expect((await callAccount("GET", "/api/account/avatar", { cookie: b.cookie })).status).toBe(
      404,
    );
    expect(await audit()).toMatchObject([{ action: "user.avatar_changed" }]);
  });

  it("deletes the old avatar's row and file when a new one replaces it", async () => {
    const { discarded } = memoryStore();
    await put("/api/account/avatar", a.cookie, AVATAR, "image/jpeg");
    await put("/api/account/avatar", a.cookie, pngHeader(128, 128));
    const { rows } = await db.query<{ key: string }>(
      "SELECT key FROM user_blobs WHERE user_id = $1",
      [a.userId],
    );
    expect(rows).toHaveLength(1);
    expect(discarded).toHaveLength(1);
    expect(discarded[0]).not.toContain(rows[0]?.key);
  });

  it("refuses an avatar that isn't square, and removes one, row and all", async () => {
    const notSquare = await put("/api/account/avatar", a.cookie, pngHeader(300, 200));
    expect(notSquare.status).toBe(422);
    await put("/api/account/avatar", a.cookie, AVATAR, "image/jpeg");
    const removed = await callAccount("DELETE", "/api/account/avatar", { cookie: a.cookie });
    expect(removed.status).toBe(200);
    const { rows } = await db.query("SELECT 1 FROM user_blobs");
    expect(rows).toEqual([]);
    expect((await callAccount("GET", "/api/account/avatar", { cookie: a.cookie })).status).toBe(
      404,
    );
    expect((await audit()).map((row) => row.action)).toEqual([
      "user.avatar_changed",
      "user.avatar_removed",
    ]);
  });
});
