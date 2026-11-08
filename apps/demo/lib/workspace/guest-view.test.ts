import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ShareServerModule from "@/lib/share/server";
import { seedLogo } from "@/test/brand-fixture";
import { routeFetch } from "@/test/route-fetch";
import { COMMENT, PNG, SNAPSHOT, STATE } from "@/test/share-fixture";
import {
  NOW,
  TEST_AUTH_SECRET,
  twoWorkspaces,
  URL_PROJECT,
  type Seat,
} from "@/test/workspace-fixture";
import type { Database } from "../db/database";
import { inlineBackend } from "../share/blob-backend";
import { logoVersion } from "../share/brand";
import { createPostgresStore } from "../share/postgres-store";
import { clientShare, clientView, createShare, putOwnerBlob } from "../share/service";
import { importData } from "./import-data";
import { importSchema } from "./schemas";

/**
 * A guest holds a share token and nothing else. Once the share belongs to a
 * workspace, nothing the guest's routes answer may carry the workspace's id,
 * a user id, a storage path or an owner secret: only logical keys, and the
 * workspace's brand by name and logo version.
 */

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/share/server", async (importOriginal) => ({
  ...(await importOriginal<typeof ShareServerModule>()),
  shareServices: () =>
    Promise.resolve({ store: createPostgresStore(holder.db as Database), blobs: inlineBackend }),
}));

let db: Database;
let a: Seat;

beforeEach(async () => {
  // The logo is read through the inline driver, whatever this shell's environment holds.
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  vi.stubEnv("VERCEL", "");
  ({ db, a } = await twoWorkspaces());
  holder.db = db;
});

describe("a workspace's share, seen by its guest", () => {
  it("never answers with a workspace id, user id, storage path or owner secret", async () => {
    const services = { store: createPostgresStore(db), blobs: inlineBackend };
    // Made now, so its review window is still open for the guest's comment.
    const created = await createShare(services, STATE, Date.now());
    const record = await services.store.byId(created.shareId);
    if (!record) throw new Error("no share");
    await putOwnerBlob(services, record, "snapshot:snap-1", PNG);
    await putOwnerBlob(services, record, "crop:c-1", PNG);
    const imported = await importData(
      db,
      a.workspaceId,
      a.userId,
      importSchema.parse({
        folders: [{ id: "f1", name: "F", createdAt: NOW }],
        projects: [
          {
            ...URL_PROJECT("web"),
            createdAt: NOW,
            updatedAt: NOW,
            share: {
              id: created.shareId,
              token: created.token,
              ownerKey: created.ownerKey,
              createdAt: NOW,
              cursor: 0,
            },
          },
        ],
        snapshots: [],
        comments: [],
      }),
      NOW,
      TEST_AUTH_SECRET,
    );
    expect(imported.ok && imported.value.imported.shares).toBe(1);
    await db.query("UPDATE squint_shares SET invited_by_user_id = $1", [a.userId]);

    const fetch = routeFetch();
    const view = await fetch(`/api/s/${created.token}`);
    expect(view.status).toBe(200);
    const form = new FormData();
    form.set(
      "comment",
      JSON.stringify({ id: "guest-1", x: 1, y: 1, body: "Guest", author: "Cleo" }),
    );
    const posted = await fetch(`/api/s/${created.token}/comments`, { method: "POST", body: form });
    expect(posted.status).toBe(201);
    const image = await fetch(`/api/s/${created.token}/blobs/snapshot:${SNAPSHOT.id}`);
    expect(image.status).toBe(200);
    const logoKey = await seedLogo(db, a.workspaceId, PNG);
    const logo = await fetch(`/api/s/${created.token}/brand/logo?v=${logoVersion(logoKey)}`);
    expect(logo.status).toBe(200);
    const share = await clientShare(services.store, created.token, Date.now());
    if (!share) throw new Error("share closed");
    const rendered = await clientView(services.store, share);

    const wire = [
      await view.text(),
      await posted.text(),
      JSON.stringify([...image.headers]),
      JSON.stringify([...logo.headers]),
      JSON.stringify(rendered),
    ].join("\n");
    for (const secret of [
      a.workspaceId,
      a.userId,
      "ws/",
      created.ownerKey,
      record.ownerKeyHash,
      record.tokenHash,
    ]) {
      expect(wire).not.toContain(secret);
    }
    // Logical keys only: comments name their crop by the comment, never by where it's stored.
    expect(rendered.comments.find((comment) => comment.id === COMMENT.id)).toEqual(COMMENT);
    expect(rendered.expiresAt).toBeNull();
    // The company's brand, by name and logo version only.
    expect(rendered.brand).toEqual({
      custom: true,
      name: "acme",
      color: null,
      hasLogo: true,
      logoVersion: logoVersion(logoKey),
    });
  });
});
