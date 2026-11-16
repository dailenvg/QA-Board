import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as iconRoute from "@/app/api/c/[key]/brand/icon/route";
import type * as DatabaseModule from "@/lib/db/database";
import { seedLogo, setBrand } from "@/test/brand-fixture";
import { PNG, TEST_AUTH_SECRET, twoWorkspaces, type Seat } from "@/test/workspace-fixture";
import type { Database } from "../db/database";
import { WORKSPACE_ICON_KEY, workspaceIconKey, workspaceIconUrl } from "./public-icon";

/**
 * A workspace's company icon for anyone signed out (its invite emails), by an
 * opaque key: never the workspace's id, versioned like every company icon,
 * and gone with the workspace.
 */

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

const SITE = "https://squint.test";
const ENV = { AUTH_URL: SITE, AUTH_SECRET: TEST_AUTH_SECRET };

let db: Database;
let a: Seat;
let b: Seat;
let address = 0;

beforeEach(async () => {
  vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  ({ db, a, b } = await twoWorkspaces());
  holder.db = db;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** The icon URL a's invite emails carry, as a path with its query. */
async function emailedPath(seat: Seat = a): Promise<string> {
  const url = new URL((await workspaceIconUrl(db, seat.workspaceId, ENV)) ?? "");
  expect(url.origin).toBe(SITE);
  return `${url.pathname}${url.search}`;
}

function icon(path: string) {
  address += 1;
  const url = new URL(path, "http://localhost");
  const key = /^\/api\/c\/([^/]+)\/brand\/icon$/.exec(url.pathname)?.[1] ?? "";
  const request = new Request(url, {
    headers: { "x-forwarded-for": `198.51.100.${address % 250}` },
  });
  return iconRoute.GET(request, { params: Promise.resolve({ key }) });
}

const withVersion = (path: string, version: string) => path.replace(/\?v=.*$/, `?v=${version}`);

describe("a workspace icon's key", () => {
  it("is 22 characters, differs per workspace, and never holds the workspace's id", () => {
    const key = workspaceIconKey(a.workspaceId, TEST_AUTH_SECRET);
    expect(key).toMatch(WORKSPACE_ICON_KEY);
    expect(workspaceIconKey(b.workspaceId, TEST_AUTH_SECRET)).not.toBe(key);
    expect(key).not.toContain(a.workspaceId.slice(0, 8));
    expect(workspaceIconKey(a.workspaceId, `${TEST_AUTH_SECRET}-rotated`)).not.toBe(key);
  });
});

describe("GET /api/c/:key/brand/icon", () => {
  it("draws the workspace's icon signed out, kept for good at its version", async () => {
    const path = await emailedPath();
    expect(path).not.toContain(a.workspaceId);
    expect(path).not.toContain("acme");
    const served = await icon(path);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    // An older email's version: the current icon, refreshed within the hour.
    const stale = await icon(withVersion(path, "0123456789abcdef"));
    expect(stale.status).toBe(200);
    expect(stale.headers.get("cache-control")).toBe("public, max-age=3600");
  });

  it("changes its version with the logo, the color and the name; never its key", async () => {
    const paths = [await emailedPath()];
    await seedLogo(db, a.workspaceId, PNG);
    paths.push(await emailedPath());
    await setBrand(db, a.workspaceId, { color: "#e03b9d" });
    paths.push(await emailedPath());
    await setBrand(db, a.workspaceId, { name: "Acme Studio", color: "#e03b9d" });
    paths.push(await emailedPath());
    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(paths.map((path) => path.split("?")[0])).size).toBe(1);
    expect((await icon(paths.at(-1) ?? "")).headers.get("cache-control")).toContain("immutable");
    expect((await icon(paths[0] ?? "")).headers.get("cache-control")).toBe("public, max-age=3600");
  });

  it("answers 404 for an unknown or malformed key", async () => {
    const version = new URL(await emailedPath(), SITE).searchParams.get("v") ?? "";
    for (const key of ["A".repeat(22), "not-a-key", a.workspaceId, "acme"]) {
      expect((await icon(`/api/c/${key}/brand/icon?v=${version}`)).status, key).toBe(404);
    }
  });

  it("answers 404 once the workspace is archived, waiting to be deleted, or gone", async () => {
    const path = await emailedPath();
    const other = await emailedPath(b);
    await db.query("UPDATE workspaces SET archived_at = now() WHERE id = $1", [a.workspaceId]);
    expect((await icon(path)).status).toBe(404);
    await db.query("UPDATE workspaces SET archived_at = NULL, delete_after = now() WHERE id = $1", [
      a.workspaceId,
    ]);
    expect((await icon(path)).status).toBe(404);
    await db.query("DELETE FROM workspaces WHERE id = $1", [b.workspaceId]);
    expect((await icon(other)).status).toBe(404);
  });
});
