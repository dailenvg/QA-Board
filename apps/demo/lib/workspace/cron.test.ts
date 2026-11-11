import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as cronRoute from "@/app/api/cron/expire/route";
import type * as DatabaseModule from "@/lib/db/database";
import { PASSWORD } from "@/test/accounts-fixture";
import { deletionWorld, WORKSPACE_NAME } from "@/test/deletion-fixture";
import { addFolder, NOW, PNG, twoWorkspaces, URL_PROJECT } from "@/test/workspace-fixture";
import { ACCOUNT_DELETION_GRACE_MS, scheduleAccountDeletion } from "../account/account-deletion";
import type { Database } from "../db/database";
import { inlineBackend } from "../share/blob-backend";
import { createPostgresStore } from "../share/postgres-store";
import type { ShareServices } from "../share/server";
import { TRASH_GRACE_MS } from "./limits";
import { createProject, listTrash, trashProject } from "./projects";
import { storeInline } from "./uploads";

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

const SECRET = "cron-secret-for-tests";
const shares = globalThis as typeof globalThis & { squintShares?: Promise<ShareServices> };

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("GITHUB_TOKEN", "");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  shares.squintShares = undefined;
  vi.unstubAllEnvs();
});

describe("expiry cron: workspace steps", () => {
  it("deletes projects past their time in the trash, with their files, and keeps the rest", async () => {
    const { db, a } = await twoWorkspaces();
    holder.db = db;
    shares.squintShares = Promise.resolve({ store: createPostgresStore(db), blobs: inlineBackend });
    await addFolder(db, a.workspaceId);
    for (const id of ["old", "recent"]) {
      await createProject(db, a.workspaceId, URL_PROJECT(id), NOW);
      await storeInline(db, a.workspaceId, { projectId: id, key: "crop:c1" }, PNG);
    }
    await trashProject(db, a.workspaceId, "old", Date.now() - TRASH_GRACE_MS - 1);
    await trashProject(db, a.workspaceId, "recent", Date.now());

    const response = await cronRoute.GET(
      new Request("http://localhost/api/cron/expire", {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );

    expect(await response.json()).toMatchObject({
      trash: 1,
      workspaceBlobs: 0,
      failed: { trash: false, workspaceBlobs: false },
    });
    expect((await listTrash(db, a.workspaceId)).map((project) => project.id)).toEqual(["recent"]);
    const { rows } = await db.query("SELECT project_id FROM workspace_blobs");
    expect(rows).toEqual([{ project_id: "recent" }]);
  });

  it("deletes accounts and workspaces whose 30 days are up, and keeps the rest", async () => {
    const world = await deletionWorld();
    holder.db = world.db;
    shares.squintShares = Promise.resolve({
      store: createPostgresStore(world.db),
      blobs: inlineBackend,
    });
    const confirm = { confirmText: WORKSPACE_NAME, currentPassword: PASSWORD, ip: "203.0.113.9" };
    await scheduleAccountDeletion(
      world.db,
      world.owner,
      confirm,
      Date.now() - ACCOUNT_DELETION_GRACE_MS - 1,
    );

    const response = await cronRoute.GET(
      new Request("http://localhost/api/cron/expire", {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );

    expect(await response.json()).toMatchObject({ accounts: 1, failed: { accounts: false } });
    const { rows } = await world.db.query<{ id: string }>("SELECT id FROM workspaces");
    expect(rows).toEqual([{ id: world.other.workspaceId }]);
  });
});
