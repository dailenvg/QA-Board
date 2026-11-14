import { beforeEach, describe, expect, it, vi } from "vitest";
import { seedLogo, setBrand } from "@/test/brand-fixture";
import { PNG, twoWorkspaces, type Seat } from "@/test/workspace-fixture";
import type { Database } from "../db/database";
import { logoVersion } from "../share/brand";
import { readProjectLogo, readProjectPreview } from "./project-preview";

/**
 * A project's own link shows anyone who has it the company and the project's
 * name, and nothing else; a project or workspace that's closed answers as an
 * unknown id does.
 */

const ID = "3f1c9a52-7d1e-4b6a-9c2f-0a8b7e6d5c4b";

let db: Database;
let a: Seat;
let b: Seat;

beforeEach(async () => {
  // The logo is read through the inline driver, whatever this shell's environment holds.
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  vi.stubEnv("VERCEL", "");
  ({ db, a, b } = await twoWorkspaces());
  await addProject(a.workspaceId, ID, "Spring launch");
});

async function addProject(workspaceId: string, id: string, name: string) {
  await db.query(
    `INSERT INTO projects (id, workspace_id, name, source)
     VALUES ($1, $2, $3, '{"kind":"url","url":"https://a.test/"}')`,
    [id, workspaceId, name],
  );
}

describe("readProjectPreview", () => {
  it("names a live project and its company, with the company's color and logo version", async () => {
    expect(await readProjectPreview(db, ID)).toEqual({
      project: "Spring launch",
      company: "acme",
      color: null,
      logoVersion: null,
    });
    await setBrand(db, a.workspaceId, { name: "Acme Studio", color: "#e03b9d" });
    const key = await seedLogo(db, a.workspaceId, PNG);
    expect(await readProjectPreview(db, ID)).toEqual({
      project: "Spring launch",
      company: "Acme Studio",
      color: "#e03b9d",
      logoVersion: logoVersion(key),
    });
  });

  it("answers null alike for an unknown id, a malformed one, and a closed project or workspace", async () => {
    expect(await readProjectPreview(db, "4a2b0c63-0000-4000-8000-000000000000")).toBeNull();
    expect(await readProjectPreview(db, "../p")).toBeNull();
    expect(await readProjectPreview(db, "x".repeat(65))).toBeNull();

    const closes = [
      ["UPDATE projects SET deleted_at = now() WHERE id = $1", ID],
      [
        "UPDATE projects SET archived_at = now(), delete_after = now() + interval '30 days' WHERE id = $1",
        ID,
      ],
      ["UPDATE workspaces SET archived_at = now() WHERE id = $1", a.workspaceId],
      [
        "UPDATE workspaces SET delete_after = now() + interval '30 days' WHERE id = $1",
        a.workspaceId,
      ],
    ] as const;
    for (const [close, target] of closes) {
      await db.query(close, [target]);
      expect(await readProjectPreview(db, ID), close).toBeNull();
      await db.query(
        "UPDATE projects SET deleted_at = NULL, archived_at = NULL, delete_after = NULL",
      );
      await db.query("UPDATE workspaces SET archived_at = NULL, delete_after = NULL");
      expect(await readProjectPreview(db, ID), `${close}, undone`).not.toBeNull();
    }
  });

  it("names each project's own workspace", async () => {
    const bravo = "8d2e4f60-1a3b-4c5d-8e9f-0a1b2c3d4e5f";
    await addProject(b.workspaceId, bravo, "Fall menu");
    expect(await readProjectPreview(db, bravo)).toMatchObject({
      project: "Fall menu",
      company: "bravo",
    });
  });

  it("previews only ids shaped like the app's random UUIDs", async () => {
    await addProject(a.workspaceId, "spring-1", "Short id");
    expect(await readProjectPreview(db, "spring-1")).toBeNull();
    expect(await readProjectLogo(db, "spring-1")).toBeNull();
  });
});

describe("readProjectLogo", () => {
  it("reads the logo of the project's workspace, and nothing for one without, or a closed project", async () => {
    expect(await readProjectLogo(db, ID)).toBeNull();
    const key = await seedLogo(db, a.workspaceId, PNG);
    const logo = await readProjectLogo(db, ID);
    expect(logo?.contentType).toBe("image/png");
    expect(logo?.version).toBe(logoVersion(key));
    // Another workspace's logo is never this project's.
    await addProject(b.workspaceId, "bravo-1", "Fall menu");
    expect(await readProjectLogo(db, "bravo-1")).toBeNull();
    await db.query("UPDATE projects SET deleted_at = now() WHERE id = $1", [ID]);
    expect(await readProjectLogo(db, ID)).toBeNull();
  });

  it("ignores a logo key that points outside the workspace's logo folder", async () => {
    await seedLogo(db, b.workspaceId, PNG);
    await db.query(
      "UPDATE workspaces SET logo_blob_key = (SELECT logo_blob_key FROM workspaces WHERE id = $2) WHERE id = $1",
      [a.workspaceId, b.workspaceId],
    );
    expect(await readProjectLogo(db, ID)).toBeNull();
    expect((await readProjectPreview(db, ID))?.logoVersion).toBeNull();
  });
});
