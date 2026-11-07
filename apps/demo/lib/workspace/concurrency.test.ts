import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import { addFolder, NOW, PNG, seat, URL_PROJECT } from "@/test/workspace-fixture";
import type { Database } from "../db/database";
import { migrate } from "../share/migrate";
import { storageSummary } from "./blobs";
import { importData } from "./import-data";
import { createProject } from "./projects";
import { importSchema } from "./schemas";
import { storeInline } from "./uploads";

/**
 * Races PGlite can't run (it has one connection): set TEST_DATABASE_URL to a
 * throwaway local Postgres. Each run migrates a schema of its own and drops it.
 */
describe.skipIf(!TEST_DATABASE_URL)("workspace writes on Postgres, in parallel", () => {
  let fresh: Awaited<ReturnType<typeof freshSchema>>;
  let db: Database;

  beforeAll(async () => {
    fresh = await freshSchema(TEST_DATABASE_URL as string);
    db = fresh.db;
    await migrate(db);
  });

  afterAll(async () => {
    await fresh.close();
  });

  it("lets only one of two workspaces import the same project id", async () => {
    const [a, b] = [await seat(db, "race-a"), await seat(db, "race-b")];
    const data = importSchema.parse({
      folders: [{ id: "f1", name: "F", createdAt: NOW }],
      projects: [{ ...URL_PROJECT("raced"), createdAt: NOW, updatedAt: NOW }],
      snapshots: [],
      comments: [],
    });
    const results = await Promise.all(
      [a, b].map((target) => importData(db, target.workspaceId, target.userId, data, NOW)),
    );
    expect(results.map((result) => result.ok).sort()).toEqual([false, true]);
    expect(results.find((result) => !result.ok)).toEqual({ ok: false, reason: "exists" });
    const { rows } = await db.query("SELECT workspace_id FROM projects WHERE id = 'raced'");
    expect(rows).toHaveLength(1);
  });

  it("never lets parallel uploads past the quota", async () => {
    const target = await seat(db, "race-quota");
    await addFolder(db, target.workspaceId);
    await createProject(db, target.workspaceId, URL_PROJECT("quota-p"), NOW);
    await db.query("UPDATE workspaces SET storage_quota_bytes = $2 WHERE id = $1", [
      target.workspaceId,
      PNG.length * 3,
    ]);
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        storeInline(db, target.workspaceId, { projectId: "quota-p", key: `crop:c${index}` }, PNG),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(3);
    expect(await storageSummary(db, target.workspaceId)).toMatchObject({
      bytes: PNG.length * 3,
      blobCount: 3,
    });
  });
});
