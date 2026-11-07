import { describe, expect, it } from "vitest";
import { insertUser } from "@/test/accounts-fixture";
import { migratedPglite } from "@/test/pglite";
import { findMembership, findOwnWorkspace } from "./memberships";

describe("findMembership", () => {
  it("finds members only, of workspaces that aren't archived", async () => {
    const db = await migratedPglite();
    const owner = await insertUser(db, "owner@acme.test");
    const admin = await insertUser(db, "admin@squint.test", "admin");
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme') RETURNING id",
    );
    const workspaceId = rows[0]?.id ?? "";
    await db.query(
      "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'owner')",
      [owner, workspaceId],
    );

    expect(await findMembership(db, owner, workspaceId)).toEqual({
      workspaceId,
      slug: "acme",
      name: "Acme",
      role: "owner",
    });
    // The admin isn't a member, so gets nothing outside /admin.
    expect(await findMembership(db, admin, workspaceId)).toBeNull();
    expect(await findMembership(db, owner, "not-a-uuid")).toBeNull();
    expect(await findMembership(db, owner, crypto.randomUUID())).toBeNull();

    await db.query("UPDATE workspaces SET archived_at = now()");
    expect(await findMembership(db, owner, workspaceId)).toBeNull();
  });
});

describe("findOwnWorkspace", () => {
  it("finds the user's workspace, and none for the admin or once it's archived", async () => {
    const db = await migratedPglite();
    const owner = await insertUser(db, "owner@acme.test");
    const admin = await insertUser(db, "admin@squint.test", "admin");
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme') RETURNING id",
    );
    const workspaceId = rows[0]?.id ?? "";
    await db.query(
      "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'owner')",
      [owner, workspaceId],
    );

    expect(await findOwnWorkspace(db, owner)).toEqual({
      workspaceId,
      slug: "acme",
      name: "Acme",
      role: "owner",
    });
    expect(await findOwnWorkspace(db, admin)).toBeNull();

    await db.query("UPDATE workspaces SET archived_at = now()");
    expect(await findOwnWorkspace(db, owner)).toBeNull();
  });
});
