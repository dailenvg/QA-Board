import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as cronRoute from "@/app/api/cron/expire/route";
import type * as DatabaseModule from "@/lib/db/database";
import { addFolder, NOW, twoWorkspaces, URL_PROJECT } from "@/test/workspace-fixture";
import type { Database } from "../db/database";
import { inlineBackend } from "../share/blob-backend";
import { createPostgresStore } from "../share/postgres-store";
import type { ShareServices } from "../share/server";
import { TRASH_GRACE_MS } from "../workspace/limits";
import { createProject, listTrash, trashProject } from "../workspace/projects";
import { CRON_RUN_STALE_MS } from "./cron-runs";
import { runExpiry } from "./run-expiry";

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

const SECRET = "cron-secret-for-tests";
const shares = globalThis as typeof globalThis & { squintShares?: Promise<ShareServices> };

interface RunRow {
  trigger: string;
  finished_at: Date | null;
  done: boolean | null;
  failed: boolean | null;
  counts: { steps: Record<string, number | null>; failed: string[] } | null;
}

const runs = async (db: Database) =>
  (await db.query<RunRow>("SELECT * FROM cron_runs ORDER BY id")).rows;

/** A workspace with a project trashed long enough ago to be purged, and the database it's in. */
async function world() {
  const { db, a } = await twoWorkspaces();
  holder.db = db;
  shares.squintShares = Promise.resolve({ store: createPostgresStore(db), blobs: inlineBackend });
  await addFolder(db, a.workspaceId);
  await createProject(db, a.workspaceId, URL_PROJECT("due"), NOW);
  await trashProject(db, a.workspaceId, "due", Date.now() - TRASH_GRACE_MS - 1);
  return { db, workspaceId: a.workspaceId };
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("GITHUB_TOKEN", "");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  holder.db = null;
  shares.squintShares = undefined;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("runExpiry", () => {
  it("runs the steps and records the run, with its trigger and counts", async () => {
    const { db } = await world();

    const run = await runExpiry({ trigger: "admin" });

    expect(run).toMatchObject({ running: false, anyFailed: false, report: { trash: 1, done: true } });
    const [row] = await runs(db);
    expect(row).toMatchObject({ trigger: "admin", done: true, failed: false });
    expect(row?.finished_at).toBeInstanceOf(Date);
    expect(row?.counts).toMatchObject({ steps: { trash: 1, shares: 0 }, failed: [] });
  });

  it("runs nothing while another run is under way", async () => {
    const { db, workspaceId } = await world();
    await db.query("INSERT INTO cron_runs (trigger, started_at) VALUES ('schedule', $1)", [
      new Date(Date.now() - 30_000),
    ]);

    expect(await runExpiry({ trigger: "admin" })).toEqual({ running: true });
    expect(await runs(db)).toHaveLength(1);
    expect((await listTrash(db, workspaceId)).map((project) => project.id)).toEqual(["due"]);
  });

  it("runs past a run that never finished", async () => {
    const { db } = await world();
    await db.query("INSERT INTO cron_runs (trigger, started_at) VALUES ('schedule', $1)", [
      new Date(Date.now() - CRON_RUN_STALE_MS - 1000),
    ]);

    expect(await runExpiry({ trigger: "schedule" })).toMatchObject({ running: false });
    expect((await runs(db)).map((row) => row.finished_at !== null)).toEqual([false, true]);
  });

  it("records which steps failed by name, never the error", async () => {
    const { db } = await world();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store = createPostgresStore(db);
    shares.squintShares = Promise.resolve({
      store: {
        ...store,
        expiredIds: () => Promise.reject(new Error("connect to postgres://user:pw@db.example")),
      },
      blobs: inlineBackend,
    });

    const run = await runExpiry({ trigger: "schedule" });

    expect(run).toMatchObject({ running: false, anyFailed: true, report: { done: false } });
    const [row] = await runs(db);
    expect(row).toMatchObject({ done: false, failed: true, counts: { failed: ["shares"] } });
    expect(JSON.stringify(row?.counts)).not.toContain("postgres");
  });

  it("runs without a database, recording nothing", async () => {
    shares.squintShares = Promise.resolve({
      store: createPostgresStore((await twoWorkspaces()).db),
      blobs: inlineBackend,
    });
    const run = await runExpiry({ trigger: "schedule" });
    expect(run).toMatchObject({ running: false, report: { trash: null, shares: 0 } });
  });

  it("still runs when the run can't be recorded, and logs only the error's kind", async () => {
    const { db } = await world();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await db.query("DROP TABLE cron_runs");

    const run = await runExpiry({ trigger: "schedule" });

    expect(run).toMatchObject({ running: false, anyFailed: false, report: { trash: 1 } });
    expect(errors.mock.calls).toEqual([["squint expiry: claiming the run failed (error 42P01)"]]);
  });
});

describe("the cron route while a run is under way", () => {
  it("answers 409 running and runs nothing", async () => {
    const { db, workspaceId } = await world();
    await db.query("INSERT INTO cron_runs (trigger, started_at) VALUES ('admin', now())");

    const response = await cronRoute.GET(
      new Request("http://localhost/api/cron/expire", {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "running" });
    expect((await listTrash(db, workspaceId)).map((project) => project.id)).toEqual(["due"]);
  });
});
