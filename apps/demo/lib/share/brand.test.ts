import { describe, expect, it } from "vitest";
import { seedLogo, setBrand } from "@/test/brand-fixture";
import { PNG, STATE } from "@/test/share-fixture";
import {
  addFolder,
  NOW,
  TEST_AUTH_SECRET,
  twoWorkspaces,
  URL_PROJECT,
} from "@/test/workspace-fixture";
import { createProject, trashProject } from "../workspace/projects";
import { attachShare } from "../workspace/share-links";
import { inlineBackend } from "./blob-backend";
import { brandColor, logoVersion, SQUINT_BRAND, toClientBrand } from "./brand";
import { createMemoryStore } from "./memory-store";
import { createPostgresStore } from "./postgres-store";
import { createShare } from "./service";

/** Workspace A's project p1 with a review link, and an anonymous share beside it. */
async function setup() {
  const { db, a, b } = await twoWorkspaces();
  await addFolder(db, a.workspaceId);
  await createProject(db, a.workspaceId, URL_PROJECT("p1"), NOW);
  const store = createPostgresStore(db);
  const services = { store, blobs: inlineBackend };
  const linked = await createShare(services, STATE, NOW);
  const anonymous = await createShare(services, STATE, NOW);
  const attached = await db.transaction((tx) =>
    attachShare(
      tx,
      a.workspaceId,
      "p1",
      { shareId: linked.shareId, token: linked.token, ownerKey: linked.ownerKey },
      NOW,
      TEST_AUTH_SECRET,
    ),
  );
  expect(attached.ok).toBe(true);
  await setBrand(db, a.workspaceId, { name: "Acme Studio", color: "#e03b9d" });
  return { db, a, b, store, linked, anonymous };
}

describe("a share's brand", () => {
  it("is its workspace's name and color, with the logo once it's stored", async () => {
    const { db, a, store, linked } = await setup();
    expect(await store.brandOf(linked.shareId)).toEqual({
      custom: true,
      name: "Acme Studio",
      color: "#e03b9d",
      logoKey: null,
    });
    expect(await store.brandLogo(linked.shareId)).toBeNull();

    const key = await seedLogo(db, a.workspaceId, PNG);
    expect(await store.brandOf(linked.shareId)).toMatchObject({ custom: true, logoKey: key });
    expect(await store.brandLogo(linked.shareId)).toEqual({
      key,
      contentType: "image/png",
      size: PNG.length,
      location: { kind: "inline", bytes: PNG },
    });
  });

  it("is Squint's own on an anonymous share and in the memory store", async () => {
    const { store, anonymous } = await setup();
    expect(await store.brandOf(anonymous.shareId)).toEqual(SQUINT_BRAND);
    expect(await store.brandLogo(anonymous.shareId)).toBeNull();
    expect(await store.brandOf("no-such-share")).toEqual(SQUINT_BRAND);
    const memory = createMemoryStore();
    expect(await memory.brandOf("any")).toEqual(SQUINT_BRAND);
    expect(await memory.brandLogo("any")).toBeNull();
  });

  it("is Squint's own, with no logo, while the share's project is in the trash", async () => {
    const { db, a, store, linked } = await setup();
    await seedLogo(db, a.workspaceId, PNG);
    await trashProject(db, a.workspaceId, "p1", NOW);
    expect(await store.brandOf(linked.shareId)).toEqual(SQUINT_BRAND);
    expect(await store.brandLogo(linked.shareId)).toBeNull();
  });

  it("is Squint's own, with no logo, while the share's workspace is archived", async () => {
    const { db, a, store, linked } = await setup();
    const key = await seedLogo(db, a.workspaceId, PNG);
    await db.query("UPDATE workspaces SET archived_at = now() WHERE id = $1", [a.workspaceId]);
    expect(await store.brandOf(linked.shareId)).toEqual(SQUINT_BRAND);
    expect(await store.brandLogo(linked.shareId)).toBeNull();

    await db.query("UPDATE workspaces SET archived_at = NULL WHERE id = $1", [a.workspaceId]);
    expect(await store.brandOf(linked.shareId)).toMatchObject({ custom: true, logoKey: key });
    expect(await store.brandLogo(linked.shareId)).toMatchObject({ key });
  });

  it("has no logo when the workspace's key points anywhere but its logo folder", async () => {
    const { db, a, b, store, linked } = await setup();
    // Another workspace's logo, then a project file of its own: neither is this share's logo.
    const theirs = await seedLogo(db, b.workspaceId, PNG);
    await db.query("UPDATE workspaces SET logo_blob_key = $2 WHERE id = $1", [
      a.workspaceId,
      theirs,
    ]);
    expect((await store.brandOf(linked.shareId)).logoKey).toBeNull();
    const projectFile = `ws/${a.workspaceId}/project/p1/page/x`;
    await db.query(
      `INSERT INTO workspace_blobs (workspace_id, key, project_id, content_type, size, bytes)
       VALUES ($1, $2, 'p1', 'image/png', $3, $4)`,
      [a.workspaceId, projectFile, PNG.length, PNG],
    );
    await db.query("UPDATE workspaces SET logo_blob_key = $2 WHERE id = $1", [
      a.workspaceId,
      projectFile,
    ]);
    expect((await store.brandOf(linked.shareId)).logoKey).toBeNull();
    expect(await store.brandLogo(linked.shareId)).toBeNull();
  });
});

describe("the brand a guest sees", () => {
  it("carries no key, only whether there's a logo and a one-way version of it", () => {
    const key = "ws/7f3c0a52-0d8e-4f4b-9a51-2f4a8b7c9d10/brand/logo/logo-1";
    const brand = toClientBrand({ custom: true, name: "Acme", color: "#0c54cc", logoKey: key });
    expect(brand).toEqual({
      custom: true,
      name: "Acme",
      color: "#0c54cc",
      hasLogo: true,
      logoVersion: logoVersion(key),
    });
    expect(brand.logoVersion).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(brand)).not.toContain("ws/");
    expect(logoVersion(`${key}x`)).not.toBe(brand.logoVersion);
    expect(toClientBrand(SQUINT_BRAND)).toEqual({
      custom: false,
      name: "Squint",
      color: null,
      hasLogo: false,
      logoVersion: null,
    });
  });

  it("only ever gets a #rrggbb color", () => {
    expect(brandColor("#0C54CC")).toBe("#0c54cc");
    expect(brandColor(null)).toBeNull();
    for (const bad of ["red", "#fff", "#0c54ccff", "url(x)", "#0c54cc;color:red"]) {
      expect(brandColor(bad), bad).toBeNull();
    }
  });
});
