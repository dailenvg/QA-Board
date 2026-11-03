import { describe, expect, it } from "vitest";
import { migratedPglite } from "@/test/pglite";
import type { Queryable } from "./migrate";

/** Inserts a workspace and returns its id. */
async function workspace(db: Queryable, slug: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ($1, $1) RETURNING id",
    [slug],
  );
  return rows[0]?.id ?? "";
}

async function user(db: Queryable, email: string, role = "company"): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, role) VALUES ($1, 'x', $2) RETURNING id",
    [email, role],
  );
  return rows[0]?.id ?? "";
}

async function usage(db: Queryable, workspaceId: string) {
  const { rows } = await db.query<{ bytes: string; blob_count: number }>(
    "SELECT bytes, blob_count FROM storage_usage WHERE workspace_id = $1",
    [workspaceId],
  );
  return rows[0] ? { bytes: Number(rows[0].bytes), count: rows[0].blob_count } : null;
}

describe("accounts schema", () => {
  it("stores emails lowercased and unique, and only known roles", async () => {
    const db = await migratedPglite();
    await user(db, "ana@example.com");
    await expect(user(db, "ana@example.com")).rejects.toThrow(/users_email_key/);
    await expect(user(db, "Ana@Example.com")).rejects.toThrow(/check/i);
    await expect(user(db, "nobody")).rejects.toThrow(/check/i);
    await expect(user(db, "guest@example.com", "guest")).rejects.toThrow(/check/i);
  });

  it("allows one owner per workspace, and members beside it", async () => {
    const db = await migratedPglite();
    const ws = await workspace(db, "acme");
    const [owner, second, member] = await Promise.all(
      ["o@acme.test", "p@acme.test", "m@acme.test"].map((email) => user(db, email)),
    );
    const join = "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, $3)";
    await db.query(join, [owner, ws, "owner"]);
    await expect(db.query(join, [second, ws, "owner"])).rejects.toThrow(/one_owner/);
    await db.query(join, [member, ws, "member"]);
  });

  it("refuses slugs and colors that aren't URL- and CSS-safe", async () => {
    const db = await migratedPglite();
    await expect(workspace(db, "ONE Agency")).rejects.toThrow(/check/i);
    await expect(
      db.query("INSERT INTO workspaces (slug, name, brand_color) VALUES ('a', 'A', 'red')"),
    ).rejects.toThrow(/check/i);
  });
});

describe("workspace content schema", () => {
  it("keeps a project's folder, and a folder's parent, in the same workspace", async () => {
    const db = await migratedPglite();
    const [a, b] = [await workspace(db, "a"), await workspace(db, "b")];
    await db.query("INSERT INTO folders (workspace_id, id, name) VALUES ($1, 'default', 'Mine')", [
      a,
    ]);
    // Folder ids are per workspace: both can have `default`.
    await db.query("INSERT INTO folders (workspace_id, id, name) VALUES ($1, 'default', 'Mine')", [
      b,
    ]);
    await expect(
      db.query(
        "INSERT INTO folders (workspace_id, id, parent_id, name) VALUES ($1, 'child', 'missing', 'C')",
        [b],
      ),
    ).rejects.toThrow(/foreign key/);
    const project = `INSERT INTO projects (id, workspace_id, folder_id, name, source)
      VALUES ($1, $2, $3, 'P', '{"kind":"url","url":"https://a.test/"}')`;
    await db.query(project, ["p1", a, "default"]);
    await expect(db.query(project, ["p2", b, "elsewhere"])).rejects.toThrow(/foreign key/);
  });

  it("deletes a folder's projects and their pages, snapshots and comments with it", async () => {
    const db = await migratedPglite();
    const ws = await workspace(db, "acme");
    await db.query("INSERT INTO folders (workspace_id, id, name) VALUES ($1, 'f', 'F')", [ws]);
    await db.query(
      `INSERT INTO projects (id, workspace_id, folder_id, name, source)
       VALUES ('p', $1, 'f', 'P', '{}')`,
      [ws],
    );
    await db.query(
      "INSERT INTO pages (project_id, id, blob_key, name, position) VALUES ('p', 'page-1', 'k', 'One', 0)",
    );
    await db.query(
      "INSERT INTO comments (project_id, id, x, y, body, author_name, page_id) VALUES ('p', 'c', 1, 2, 'Hi', 'Ana', 'page-1')",
    );
    // No surface CHECK: a comment on neither a page nor a snapshot is allowed.
    await db.query(
      "INSERT INTO comments (project_id, id, x, y, body, author_name) VALUES ('p', 'live', 1, 2, 'Hi', 'Ana')",
    );
    await db.query("DELETE FROM folders WHERE workspace_id = $1 AND id = 'f'", [ws]);
    const { rows } = await db.query<{ count: string }>("SELECT count(*) FROM comments");
    expect(Number(rows[0]?.count)).toBe(0);
  });

  it("swaps page positions within one transaction", async () => {
    const db = await migratedPglite();
    const ws = await workspace(db, "acme");
    await db.query("INSERT INTO folders (workspace_id, id, name) VALUES ($1, 'f', 'F')", [ws]);
    await db.query(
      "INSERT INTO projects (id, workspace_id, folder_id, name, source) VALUES ('p', $1, 'f', 'P', '{}')",
      [ws],
    );
    await db.query(`INSERT INTO pages (project_id, id, blob_key, name, position)
      VALUES ('p', 'a', 'ka', 'A', 0), ('p', 'b', 'kb', 'B', 1)`);
    await db.query(`BEGIN;
      UPDATE pages SET position = 1 WHERE id = 'a';
      UPDATE pages SET position = 0 WHERE id = 'b';
      COMMIT;`);
    const { rows } = await db.query<{ id: string }>("SELECT id FROM pages ORDER BY position");
    expect(rows.map((row) => row.id)).toEqual(["b", "a"]);
  });
});

describe("storage usage", () => {
  const blob = (size: number, key: string) =>
    `INSERT INTO workspace_blobs (workspace_id, key, content_type, size, blob_url)
     VALUES ($1, '${key}', 'image/png', ${size}, 'https://blob.test/${key}')`;

  it("starts at zero and follows blob inserts, resizes and deletes", async () => {
    const db = await migratedPglite();
    const ws = await workspace(db, "acme");
    expect(await usage(db, ws)).toEqual({ bytes: 0, count: 0 });
    await db.query(blob(100, "a"), [ws]);
    await db.query(blob(50, "b"), [ws]);
    expect(await usage(db, ws)).toEqual({ bytes: 150, count: 2 });
    await db.query("UPDATE workspace_blobs SET size = 70 WHERE key = 'b'");
    expect(await usage(db, ws)).toEqual({ bytes: 170, count: 2 });
    await db.query("DELETE FROM workspace_blobs WHERE key = 'a'");
    expect(await usage(db, ws)).toEqual({ bytes: 70, count: 1 });
  });

  it("lets a workspace with blobs be deleted", async () => {
    const db = await migratedPglite();
    const ws = await workspace(db, "acme");
    await db.query(blob(100, "a"), [ws]);
    await db.query("DELETE FROM workspaces WHERE id = $1", [ws]);
    expect(await usage(db, ws)).toBeNull();
  });

  it("keeps a deleted project's blob rows, without the project", async () => {
    const db = await migratedPglite();
    const ws = await workspace(db, "acme");
    await db.query("INSERT INTO folders (workspace_id, id, name) VALUES ($1, 'f', 'F')", [ws]);
    await db.query(
      "INSERT INTO projects (id, workspace_id, folder_id, name, source) VALUES ('p', $1, 'f', 'P', '{}')",
      [ws],
    );
    await db.query(
      `INSERT INTO workspace_blobs (workspace_id, key, project_id, content_type, size, blob_url)
       VALUES ($1, 'k', 'p', 'image/png', 10, 'https://blob.test/k')`,
      [ws],
    );
    await db.query("DELETE FROM projects WHERE id = 'p'");
    const { rows } = await db.query<{ workspace_id: string; project_id: string | null }>(
      "SELECT workspace_id, project_id FROM workspace_blobs",
    );
    expect(rows).toEqual([{ workspace_id: ws, project_id: null }]);
    expect(await usage(db, ws)).toEqual({ bytes: 10, count: 1 });
  });
});
