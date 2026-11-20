import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import * as archiveRoute from "@/app/api/admin/workspaces/[id]/archive/route";
import * as quotaRoute from "@/app/api/admin/workspaces/[id]/quota/route";
import * as resetLinkRoute from "@/app/api/admin/workspaces/[id]/reset-link/route";
import * as suspensionRoute from "@/app/api/admin/workspaces/[id]/suspension/route";
import { insertUser } from "@/test/accounts-fixture";
import { routeFetch } from "@/test/route-fetch";
import { STATE } from "@/test/share-fixture";
import { insertSession } from "@/test/sessions-fixture";
import {
  addFolder,
  TEST_AUTH_SECRET,
  twoWorkspaces,
  URL_PROJECT,
  type Seat,
} from "@/test/workspace-fixture";
import type { Database } from "../db/database";
import { inlineBackend } from "../share/blob-backend";
import { invitationCard } from "../share/guest-share";
import { createPostgresStore } from "../share/postgres-store";
import type { ShareServices } from "../share/server";
import { createShare } from "../share/service";
import { createProject } from "../workspace/projects";
import { attachShare } from "../workspace/share-links";
import { MAX_QUOTA_BYTES, MIN_QUOTA_BYTES } from "./quota";

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

type Handler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

/** Every admin workspace endpoint: its route under `/api/admin/workspaces/<id>/`, method, handler. */
const ENDPOINTS: Array<{ route: string; method: string; handler: Handler; body: unknown }> = [
  { route: "quota", method: "PUT", handler: quotaRoute.PUT, body: { quotaBytes: 1024 ** 3 } },
  { route: "reset-link", method: "POST", handler: resetLinkRoute.POST, body: {} },
  { route: "suspension", method: "PUT", handler: suspensionRoute.PUT, body: {} },
  { route: "suspension", method: "DELETE", handler: suspensionRoute.DELETE, body: {} },
  { route: "archive", method: "PUT", handler: archiveRoute.PUT, body: {} },
  { route: "archive", method: "DELETE", handler: archiveRoute.DELETE, body: {} },
];

const ORIGIN = "http://localhost:3000";

interface CallInit {
  cookie?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

function call(
  { route, method, handler }: (typeof ENDPOINTS)[number],
  id: string,
  { cookie, body = {}, headers = {} }: CallInit = {},
): Promise<Response> {
  const request = new Request(`${ORIGIN}/api/admin/workspaces/${id}/${route}`, {
    method,
    headers: {
      host: "localhost:3000",
      origin: ORIGIN,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return handler(request, { params: Promise.resolve({ id }) });
}

const endpoint = (route: string, method: string) => {
  const found = ENDPOINTS.find((entry) => entry.route === route && entry.method === method);
  if (!found) throw new Error(`no ${method} ${route}`);
  return found;
};

let db: Database;
let a: Seat;
let admin: string;

beforeEach(async () => {
  const world = await twoWorkspaces();
  db = world.db;
  a = world.a;
  holder.db = db;
  const adminId = await insertUser(db, "admin@squint.test", "admin");
  admin = `squint_session=${await insertSession(db, adminId, Date.now())}`;
  (globalThis as { squintShares?: Promise<ShareServices> }).squintShares = Promise.resolve({
    store: createPostgresStore(db),
    blobs: inlineBackend,
  });
});

describe("the admin workspace routes' guard", () => {
  it.each(ENDPOINTS)("$method $route: 401 signed out, 404 for a company user", async (entry) => {
    const signedOut = await call(entry, a.workspaceId, { body: entry.body });
    expect(signedOut.status).toBe(401);
    expect(await signedOut.json()).toEqual({ error: "unauthenticated" });
    const company = await call(entry, a.workspaceId, { cookie: a.cookie, body: entry.body });
    expect(company.status).toBe(404);
    expect(await company.json()).toEqual({ error: "not-found" });
    const { rows } = await db.query("SELECT 1 FROM audit_log WHERE action LIKE 'admin.%'");
    expect(rows).toEqual([]);
  });

  it.each(ENDPOINTS)("$method $route: refuses another site and a form's body", async (entry) => {
    const crossSite = await call(entry, a.workspaceId, {
      cookie: admin,
      body: entry.body,
      headers: { origin: "https://evil.example" },
    });
    expect(crossSite.status).toBe(403);
    const form = await call(entry, a.workspaceId, {
      cookie: admin,
      body: "quotaBytes=1",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(form.status).toBe(415);
  });

  it.each(ENDPOINTS)("$method $route: 404 for an id that isn't a workspace's", async (entry) => {
    for (const id of ["not-a-uuid", "00000000-0000-4000-8000-000000000000"]) {
      const response = await call(entry, id, { cookie: admin, body: entry.body });
      expect(response.status).toBe(404);
    }
  });

  it.each(ENDPOINTS)("$method $route: 400 for a body it doesn't take", async (entry) => {
    const response = await call(entry, a.workspaceId, {
      cookie: admin,
      body: { ...(entry.body as object), extra: true },
    });
    expect(response.status).toBe(400);
  });
});

describe("PUT …/quota", () => {
  it("sets the quota within its bounds and answers the workspace as the list shows it", async () => {
    const quota = endpoint("quota", "PUT");
    const response = await call(quota, a.workspaceId, {
      cookie: admin,
      body: { quotaBytes: 2 * 1024 ** 3 },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      workspace: { id: a.workspaceId, quotaBytes: 2 * 1024 ** 3, status: "active" },
    });
    for (const quotaBytes of [MIN_QUOTA_BYTES - 1, MAX_QUOTA_BYTES + 1, 1.5 * 1024 ** 3 + 0.5]) {
      const refused = await call(quota, a.workspaceId, { cookie: admin, body: { quotaBytes } });
      expect(refused.status).toBe(400);
    }
  });
});

describe("POST …/reset-link", () => {
  it("answers the link once, uncached, and keeps it out of the audit log", async () => {
    const response = await call(endpoint("reset-link", "POST"), a.workspaceId, { cookie: admin });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { link, expiresAt } = (await response.json()) as { link: string; expiresAt: number };
    expect(link).toMatch(/\/reset\/[A-Za-z0-9_-]{43}$/);
    expect(expiresAt).toBeGreaterThan(Date.now());
    const { rows } = await db.query<{ meta: unknown }>("SELECT meta FROM audit_log");
    expect(JSON.stringify(rows)).not.toContain(link.split("/").at(-1));
  });

  it("answers 409 no-owner once the owner's account is deleted", async () => {
    await db.query("UPDATE users SET deleted_at = now() WHERE id = $1", [a.userId]);
    const response = await call(endpoint("reset-link", "POST"), a.workspaceId, { cookie: admin });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "no-owner" });
  });
});

describe("suspension and archive", () => {
  it("answers the workspace's new state each way", async () => {
    const state = async (route: string, method: string) => {
      const response = await call(endpoint(route, method), a.workspaceId, { cookie: admin });
      expect(response.status).toBe(200);
      const { workspace } = (await response.json()) as {
        workspace: { status: string; archivedAt: number | null };
      };
      return { status: workspace.status, archived: workspace.archivedAt !== null };
    };
    expect(await state("suspension", "PUT")).toEqual({ status: "suspended", archived: false });
    expect(await state("archive", "PUT")).toEqual({ status: "suspended", archived: true });
    expect(await state("suspension", "DELETE")).toEqual({ status: "active", archived: true });
    expect(await state("archive", "DELETE")).toEqual({ status: "active", archived: false });
  });
});

describe("PUT …/archive on a workspace scheduled for deletion", () => {
  it("answers 409 deleting and archives nothing", async () => {
    await db.query(
      "UPDATE workspaces SET delete_after = now() + interval '30 days' WHERE id = $1",
      [a.workspaceId],
    );
    const response = await call(endpoint("archive", "PUT"), a.workspaceId, { cookie: admin });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "deleting" });
    const { rows } = await db.query("SELECT 1 FROM workspaces WHERE archived_at IS NOT NULL");
    expect(rows).toEqual([]);
  });
});

describe("a guest's review link while its workspace is suspended", () => {
  it("answers 404 paused to every guest route, with a generic preview, until it's lifted", async () => {
    // Made now, so its review window is open for the guest's comment.
    const now = Date.now();
    const store = createPostgresStore(db);
    await addFolder(db, a.workspaceId);
    await createProject(db, a.workspaceId, URL_PROJECT("p1"), now);
    const { shareId, token, ownerKey } = await createShare(
      { store, blobs: inlineBackend },
      STATE,
      now,
    );
    await db.transaction((tx) =>
      attachShare(tx, a.workspaceId, "p1", { shareId, token, ownerKey }, now, TEST_AUTH_SECRET),
    );
    await db.query("UPDATE workspaces SET brand_color = '#112233' WHERE id = $1", [a.workspaceId]);
    const guest = routeFetch();
    const comment = () => {
      const form = new FormData();
      form.set(
        "comment",
        JSON.stringify({ id: "c-new", x: 1, y: 1, body: "Looks good", author: "Cleo" }),
      );
      return guest(`/api/s/${token}/comments`, { method: "POST", body: form });
    };
    expect((await guest(`/api/s/${token}`)).status).toBe(200);
    expect(await invitationCard(token)).not.toBeNull();

    await call(endpoint("suspension", "PUT"), a.workspaceId, { cookie: admin });
    for (const response of [await guest(`/api/s/${token}`), await comment()]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "paused" });
    }
    // The preview card says no more than any link that doesn't open.
    expect(await invitationCard(token)).toBeNull();
    // Any other token is still a plain 404.
    const unknown = await guest(`/api/s/${"x".repeat(43)}`);
    expect(await unknown.json()).toEqual({ error: "not-found" });

    await call(endpoint("suspension", "DELETE"), a.workspaceId, { cookie: admin });
    expect((await guest(`/api/s/${token}`)).status).toBe(200);
    expect((await comment()).status).toBe(201);
  });
});
