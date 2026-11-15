import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import type * as ShareServerModule from "@/lib/share/server";
import { migratedPglite } from "@/test/pglite";
import { PUBLIC_IMAGES, ROUTE_PERMISSIONS, type RouteAccess } from "@/test/route-permissions";
import { STATE } from "@/test/share-fixture";
import {
  addFolder,
  memberSeat,
  PNG,
  seat,
  TEST_AUTH_SECRET,
  URL_PROJECT,
  type Seat,
} from "@/test/workspace-fixture";
import { call } from "@/test/workspace-routes";
import type { Database } from "../db/database";
import { inlineBackend } from "../share/blob-backend";
import { OWNER_KEY_HEADER } from "../share/http-headers";
import { createPostgresStore } from "../share/postgres-store";
import { createShare } from "../share/service";
import {
  isOwnerOnly,
  isSwitchPermission,
  MEMBER_SWITCHES,
  SWITCH_FOR,
  type Permission,
} from "./permissions";

/**
 * Every API route file and method is classified in `ROUTE_PERMISSIONS`, so a
 * new route can't ship unclassified; and each switch-backed or owner-only one
 * answers as section 3's matrix says, called as the owner and as members.
 */

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

vi.mock("@/lib/share/server", async (importOriginal) => ({
  ...(await importOriginal<typeof ShareServerModule>()),
  shareServices: () =>
    Promise.resolve({ store: createPostgresStore(holder.db as Database), blobs: inlineBackend }),
}));

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;
type Module = Partial<Record<string, unknown>>;

/** Every `route.ts` below `app/api`, relative to the app. */
function routeFiles(dir = join(ROOT, "app/api")): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [relative(ROOT, path)] : [];
  });
}

/** `app/api/w/[workspaceId]/route.ts` as `/api/w/:workspaceId`. */
const routePath = (file: string) =>
  `/${file.replace(/^app\//, "").replace(/\/route\.ts$/, "")}`.replace(/\[(\w+)\]/g, ":$1");

const modules = new Map<string, Module>();

beforeAll(async () => {
  for (const file of routeFiles()) {
    modules.set(routePath(file), (await import(join(ROOT, file))) as Module);
  }
}, 60_000);

const exported = (module: Module) =>
  METHODS.filter((method) => typeof module[method] === "function");

describe("every API route is classified", () => {
  it("has an entry for each route file and each method it exports", () => {
    const missing = [...modules].flatMap(([path, module]) =>
      exported(module)
        .filter((method) => !ROUTE_PERMISSIONS[path]?.[method])
        .map((method) => `${method} ${path}`),
    );
    expect(missing).toEqual([]);
  });

  it("lists nothing that isn't there any more", () => {
    const stale = Object.entries(ROUTE_PERMISSIONS).flatMap(([path, methods]) =>
      Object.keys(methods)
        .filter(
          (method) =>
            !modules.get(path) || !exported(modules.get(path) ?? {}).includes(method as never),
        )
        .map((method) => `${method} ${path}`),
    );
    expect(stale).toEqual([]);
  });

  it("lists the metadata images by hand, as public, and they're all there", () => {
    for (const file of PUBLIC_IMAGES) expect(existsSync(join(ROOT, file)), file).toBe(true);
  });
});

let db: Database;
let owner: Seat;
let share: { shareId: string; token: string; ownerKey: string };
let ip = 0;

/** Workspace A: a folder, a website project with its review link attached, the owner signed in. */
beforeEach(async () => {
  vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
  db = await migratedPglite();
  holder.db = db;
  owner = await seat(db, "acme");
  await addFolder(db, owner.workspaceId);
  const as = (method: string, route: string, body?: unknown) =>
    call(method, `/api/w/${owner.workspaceId}${route}`, { cookie: owner.cookie, body });
  expect((await as("POST", "/projects", URL_PROJECT("p1"))).status).toBe(201);
  const created = await createShare(
    { store: createPostgresStore(db), blobs: inlineBackend },
    STATE,
    Date.now(),
  );
  share = { shareId: created.shareId, token: created.token, ownerKey: created.ownerKey };
  expect((await as("PUT", "/projects/p1/share-link", share)).status).toBe(200);
});

/** Raw bytes for the routes that take an image, JSON for the rest. */
const BYTES = new Set([
  "PUT /api/account/workspace/logo",
  "PUT /api/w/:workspaceId/projects/:projectId/blobs/:key",
  "PUT /api/shares/:shareId/blobs/:key",
]);

/** Calls `method path` as `who`'s browser would: same-site, signed in, with the share's key. */
async function hit(method: string, path: string, who: Seat): Promise<Response> {
  ip += 1;
  const params: Record<string, string> = {
    workspaceId: who.workspaceId,
    projectId: "p1",
    folderId: "f1",
    commentId: "c1",
    snapshotId: "s1",
    key: "page:p1",
    shareId: share.shareId,
    token: share.token,
    inviteId: "00000000-0000-4000-8000-000000000000",
  };
  const url = path.replace(/:(\w+)/g, (_match, name: string) => params[name] ?? name);
  const bytes = BYTES.has(`${method} ${path}`);
  const handler = modules.get(path)?.[method] as Handler;
  const request = new Request(`http://localhost:3000${url}`, {
    method,
    headers: {
      host: "localhost:3000",
      cookie: who.cookie,
      "x-forwarded-for": `198.51.100.${ip % 250}`,
      [OWNER_KEY_HEADER]: share.ownerKey,
      ...(method === "GET"
        ? {}
        : {
            origin: "http://localhost:3000",
            "content-type": bytes ? "image/png" : "application/json",
          }),
    },
    body: method === "GET" ? undefined : bytes ? PNG : "{}",
  });
  return handler(request, { params: Promise.resolve(params) });
}

/** A domain answer (2xx, 4xx about the request): anything but no session, a refusal or a crash. */
const gotIn = (status: number) => ![401, 403, 500].includes(status);

const entries = Object.entries(ROUTE_PERMISSIONS).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, access]) => ({ method, path, access })),
);
const permissionOf = (access: RouteAccess): Permission | undefined =>
  access.kind === "permission" || access.kind === "owner-key+member"
    ? access.permission
    : undefined;

const SWITCHED = entries.filter(({ access }) => {
  const permission = permissionOf(access);
  return permission !== undefined && isSwitchPermission(permission);
});
const OWNER_ONLY = entries.filter(({ access }) => {
  const permission = permissionOf(access);
  return permission !== undefined && isOwnerOnly(permission);
});
const EVERY_MEMBER = entries.filter(
  ({ access }) =>
    access.kind === "permission" &&
    (access.permission === "workspace.read" || access.permission === "workspace.write"),
);

describe("switch-backed routes", () => {
  it("cover every switch, and the revoke of a workspace's share", () => {
    expect(new Set(SWITCHED.map(({ access }) => permissionOf(access)))).toEqual(
      new Set(["links.manage", "projects.trash", "workspace.import", "members.manage"]),
    );
    expect(SWITCHED.map(({ method, path }) => `${method} ${path}`)).toContain(
      "DELETE /api/shares/:shareId",
    );
  });

  it.each(SWITCHED.map((entry) => [`${entry.method} ${entry.path}`, entry] as const))(
    "%s: 403 not-allowed with the switch off; in with it on, and for the owner",
    async (_name, { method, path, access }) => {
      const permission = permissionOf(access) as Exclude<Permission, "workspace.read">;
      const on = SWITCH_FOR[permission as keyof typeof SWITCH_FOR];
      const off = await memberSeat(
        db,
        owner.workspaceId,
        MEMBER_SWITCHES.filter((value) => value !== on),
      );
      const refused = await hit(method, path, off);
      expect(refused.status).toBe(403);
      expect(await refused.json()).toEqual({ error: "not-allowed", permission });
      const allowed = await memberSeat(db, owner.workspaceId, [on]);
      expect(gotIn((await hit(method, path, allowed)).status)).toBe(true);
      expect(gotIn((await hit(method, path, owner)).status)).toBe(true);
    },
  );
});

describe("owner-only routes", () => {
  it.each(OWNER_ONLY.map((entry) => [`${entry.method} ${entry.path}`, entry] as const))(
    "%s: 403 owner-only for a member with every switch on, in for the owner",
    async (_name, { method, path }) => {
      const member = await memberSeat(db, owner.workspaceId, MEMBER_SWITCHES);
      const refused = await hit(method, path, member);
      expect(refused.status).toBe(403);
      expect(await refused.json()).toEqual({ error: "owner-only" });
      expect(gotIn((await hit(method, path, owner)).status)).toBe(true);
    },
  );
});

describe("routes for every member", () => {
  it("let a member with every switch off in, read and write", async () => {
    const member = await memberSeat(db, owner.workspaceId, []);
    const refused: string[] = [];
    for (const { method, path } of EVERY_MEMBER) {
      const { status } = await hit(method, path, member);
      if (status === 401 || status === 403) refused.push(`${method} ${path}: ${status}`);
    }
    expect(refused).toEqual([]);
  });
});
