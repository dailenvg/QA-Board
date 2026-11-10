import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import { callAccount } from "@/test/account-routes";
import { insertUser } from "@/test/accounts-fixture";
import { migratedPglite } from "@/test/pglite";
import { addProjectBlob, storedWorkspace } from "@/test/storage-fixture";
import { addFolder, NOW, seat, URL_PROJECT, type Seat } from "@/test/workspace-fixture";
import { createSession } from "../auth/sessions";
import type { Database } from "../db/database";
import { createProject } from "../workspace/projects";
import { storageReportSchema } from "./schemas";

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

let db: Database;
let a: Seat;
let b: Seat;

beforeEach(async () => {
  db = await migratedPglite();
  holder.db = db;
  a = await seat(db, "acme");
  b = await seat(db, "bravo");
  await storedWorkspace(db, a.workspaceId);
  await addFolder(db, b.workspaceId, "fb");
  await createProject(db, b.workspaceId, URL_PROJECT("secret", "fb"), NOW);
  await addProjectBlob(db, b.workspaceId, "secret", "snapshot", "s", 999);
});

async function signedIn(email: string, workspaceId?: string): Promise<string> {
  const userId = await insertUser(db, email);
  if (workspaceId) {
    await db.query(
      "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'member')",
      [userId, workspaceId],
    );
  }
  return `squint_session=${await createSession(db, userId, Date.now())}`;
}

describe("GET /api/account/storage", () => {
  it("answers the owner's workspace report, valid by its schema", async () => {
    const response = await callAccount("GET", "/api/account/storage", { cookie: a.cookie });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const report = storageReportSchema.parse(await response.json());
    expect(report.usedBytes).toBe(1377);
    expect(report.largeProjects.map((project) => project.id)).toEqual([
      "deck",
      "site",
      "shots",
      "old",
    ]);
  });

  it("answers a member who doesn't own the workspace too: it's read-only", async () => {
    const cookie = await signedIn("member@acme.test", a.workspaceId);
    const response = await callAccount("GET", "/api/account/storage", { cookie });
    expect(response.status).toBe(200);
    expect(storageReportSchema.parse(await response.json()).usedBytes).toBe(1377);
  });

  it("only ever reports the session's own workspace, whatever the request names", async () => {
    const response = await callAccount("GET", "/api/account/storage", {
      cookie: b.cookie,
      search: `?workspaceId=${a.workspaceId}`,
    });
    const report = storageReportSchema.parse(await response.json());
    expect(report.usedBytes).toBe(999);
    expect(report.largeProjects.map((project) => project.id)).toEqual(["secret"]);
  });

  it("answers 404 for an account in no workspace", async () => {
    const cookie = await signedIn("loner@squint.test");
    const response = await callAccount("GET", "/api/account/storage", { cookie });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not-found" });
  });
});
