import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as orphansRoute from "@/app/api/admin/storage/orphans/route";
import * as sweepRoute from "@/app/api/admin/sweep/route";
import type * as DatabaseModule from "@/lib/db/database";
import { insertUser } from "@/test/accounts-fixture";
import { addFolder, NOW, twoWorkspaces, URL_PROJECT, type Seat } from "@/test/workspace-fixture";
import { createSession } from "../auth/sessions";
import type { Database } from "../db/database";
import { inlineBackend } from "../share/blob-backend";
import { createPostgresStore } from "../share/postgres-store";
import type { ShareServices } from "../share/server";
import { blobPath } from "../workspace/blob-paths";
import { TRASH_GRACE_MS } from "../workspace/limits";
import { createProject, listTrash, trashProject } from "../workspace/projects";

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

/** Both Storage page endpoints: their path under `/api/admin/` and handler. */
const ENDPOINTS = [
  { route: "storage/orphans", handler: orphansRoute.POST },
  { route: "sweep", handler: sweepRoute.POST },
];

const ORIGIN = "http://localhost:3000";

interface CallInit {
  cookie?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

function call(
  { route, handler }: (typeof ENDPOINTS)[number],
  { cookie, body = {}, headers = {} }: CallInit = {},
): Promise<Response> {
  return handler(
    new Request(`${ORIGIN}/api/admin/${route}`, {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: ORIGIN,
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const [orphans, sweep] = ENDPOINTS as [(typeof ENDPOINTS)[number], (typeof ENDPOINTS)[number]];

let db: Database;
let a: Seat;
let admin: string;
let adminId: string;

const adminEntries = async () =>
  (
    await db.query<{ action: string; workspace_id: string | null; target_type: string | null }>(
      "SELECT action, workspace_id, target_type FROM audit_log WHERE action LIKE 'admin.%'",
    )
  ).rows;

beforeEach(async () => {
  vi.stubEnv("GITHUB_TOKEN", "");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  const world = await twoWorkspaces();
  db = world.db;
  a = world.a;
  holder.db = db;
  adminId = await insertUser(db, "admin@squint.test", "admin");
  admin = `squint_session=${await createSession(db, adminId, Date.now())}`;
  (globalThis as { squintShares?: Promise<ShareServices> }).squintShares = Promise.resolve({
    store: createPostgresStore(db),
    blobs: inlineBackend,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the Storage page routes' guard", () => {
  it.each(ENDPOINTS)("$route: 401 signed out, 404 for a company user", async (entry) => {
    const signedOut = await call(entry);
    expect(signedOut.status).toBe(401);
    expect(await signedOut.json()).toEqual({ error: "unauthenticated" });
    const company = await call(entry, { cookie: a.cookie });
    expect(company.status).toBe(404);
    expect(await company.json()).toEqual({ error: "not-found" });
    expect(await adminEntries()).toEqual([]);
    const { rows } = await db.query("SELECT 1 FROM cron_runs");
    expect(rows).toEqual([]);
  });

  it.each(ENDPOINTS)(
    "$route: refuses another site, a form's body, and any field",
    async (entry) => {
      const crossSite = await call(entry, {
        cookie: admin,
        headers: { origin: "https://evil.example" },
      });
      expect(crossSite.status).toBe(403);
      const form = await call(entry, {
        cookie: admin,
        body: "run=1",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      });
      expect(form.status).toBe(415);
      const extra = await call(entry, { cookie: admin, body: { dryRun: false } });
      expect(extra.status).toBe(400);
      const { rows } = await db.query("SELECT 1 FROM cron_runs");
      expect(rows).toEqual([]);
    },
  );
});

describe("POST /api/admin/storage/orphans", () => {
  it("counts what the sweeps would delete, deletes nothing, and records nothing", async () => {
    await addFolder(db, a.workspaceId);
    await createProject(db, a.workspaceId, URL_PROJECT("gone"), NOW);
    await db.query(
      `INSERT INTO workspace_blobs (workspace_id, key, project_id, content_type, size, bytes)
       VALUES ($1, $2, 'gone', 'image/png', 4, '\\x00010203')`,
      [a.workspaceId, blobPath(a.workspaceId, "gone", "page:a")],
    );
    await db.query("DELETE FROM projects WHERE id = 'gone'");

    const response = await call(orphans, { cookie: admin });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { report } = (await response.json()) as { report: Record<string, unknown> };
    expect(report.checkedAt).toEqual(expect.any(Number) as unknown);
    expect({ ...report, checkedAt: 0 }).toEqual({
      checkedAt: 0,
      complete: true,
      // Inline here: neither kind of Blob file applies.
      shareFiles: null,
      workspaceRows: { files: 1, bytes: 4 },
      unrecordedFiles: null,
    });
    const { rows } = await db.query("SELECT 1 FROM workspace_blobs");
    expect(rows).toHaveLength(1);
    expect(await adminEntries()).toEqual([]);
  });
});

describe("POST /api/admin/sweep", () => {
  it("runs the whole cleanup, answers its report, and records the run and an audit entry", async () => {
    await addFolder(db, a.workspaceId);
    await createProject(db, a.workspaceId, URL_PROJECT("due"), NOW);
    await trashProject(db, a.workspaceId, "due", Date.now() - TRASH_GRACE_MS - 1);

    const response = await call(sweep, { cookie: admin });

    expect(response.status).toBe(200);
    const { report } = (await response.json()) as { report: Record<string, unknown> };
    expect(report).toMatchObject({ trash: 1, done: true, failed: { trash: false } });
    expect(await listTrash(db, a.workspaceId)).toEqual([]);
    const { rows: runs } = await db.query("SELECT trigger FROM cron_runs");
    expect(runs).toEqual([{ trigger: "admin" }]);
    expect(await adminEntries()).toEqual([
      { action: "admin.sweep_run", workspace_id: null, target_type: null },
    ]);
    const { rows: meta } = await db.query<{ meta: unknown; actor_user_id: string }>(
      "SELECT meta, actor_user_id FROM audit_log WHERE action = 'admin.sweep_run'",
    );
    expect(meta).toEqual([{ meta: { fields: [] }, actor_user_id: adminId }]);
  });

  it("answers 409 running while another run is under way, and runs and records nothing", async () => {
    await db.query("INSERT INTO cron_runs (trigger, started_at) VALUES ('schedule', now())");

    const response = await call(sweep, { cookie: admin });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "running" });
    const { rows } = await db.query("SELECT 1 FROM cron_runs");
    expect(rows).toHaveLength(1);
    expect(await adminEntries()).toEqual([]);
  });
});
