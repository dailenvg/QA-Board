import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ShareServerModule from "@/lib/share/server";
import { seedLogo } from "@/test/brand-fixture";
import { routeFetch } from "@/test/route-fetch";
import { JPEG, PNG, STATE } from "@/test/share-fixture";
import {
  addFolder,
  NOW,
  TEST_AUTH_SECRET,
  twoWorkspaces,
  URL_PROJECT,
  type Seat,
} from "@/test/workspace-fixture";
import type { Database } from "../db/database";
import { createProject, trashProject } from "../workspace/projects";
import { attachShare } from "../workspace/share-links";
import { inlineBackend } from "./blob-backend";
import { logoVersion } from "./brand";
import { cardLogoUri, LOGO_MAX_AGE_SECONDS, type BrandLogo } from "./brand-logo";
import { createPostgresStore } from "./postgres-store";
import { createShare, revokeShare, type CreatedShare } from "./service";

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/share/server", async (importOriginal) => ({
  ...(await importOriginal<typeof ShareServerModule>()),
  shareServices: () =>
    Promise.resolve({ store: createPostgresStore(holder.db as Database), blobs: inlineBackend }),
}));

const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

let db: Database;
let a: Seat;
let linked: CreatedShare;
let anonymous: CreatedShare;
const fetchRoute = routeFetch();

const logo = (token: string, version?: string) =>
  fetchRoute(`/api/s/${token}/brand/logo${version ? `?v=${version}` : ""}`);

beforeEach(async () => {
  // Files are read through the inline driver, whatever this shell's environment holds.
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  vi.stubEnv("VERCEL", "");
  ({ db, a } = await twoWorkspaces());
  holder.db = db;
  await addFolder(db, a.workspaceId);
  await createProject(db, a.workspaceId, URL_PROJECT("p1"), NOW);
  const services = { store: createPostgresStore(db), blobs: inlineBackend };
  linked = await createShare(services, STATE, NOW);
  anonymous = await createShare(services, STATE, NOW);
  await db.transaction((tx) =>
    attachShare(
      tx,
      a.workspaceId,
      "p1",
      { shareId: linked.shareId, token: linked.token, ownerKey: linked.ownerKey },
      NOW,
      TEST_AUTH_SECRET,
    ),
  );
});

describe("GET /api/s/<token>/brand/logo", () => {
  it("streams the workspace's logo, kept briefly and privately at its current version", async () => {
    const key = await seedLogo(db, a.workspaceId, PNG);
    const current = await logo(linked.token, logoVersion(key));
    expect(current.status).toBe(200);
    expect(current.headers.get("content-type")).toBe("image/png");
    expect(current.headers.get("cache-control")).toBe(`private, max-age=${LOGO_MAX_AGE_SECONDS}`);
    expect(current.headers.get("cache-control")).not.toContain("s-maxage");
    expect(current.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await current.arrayBuffer())).toEqual(PNG);

    // Without the current version (an old page, a guessed URL), nothing is kept.
    for (const response of [await logo(linked.token), await logo(linked.token, "stale")]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("answers with the type the bytes are, not the one stored", async () => {
    await seedLogo(db, a.workspaceId, JPEG, { contentType: "image/svg+xml" });
    expect((await logo(linked.token)).headers.get("content-type")).toBe("image/jpeg");
  });

  it("is a plain 404 without a logo, or when the stored file isn't an image", async () => {
    const none = await logo(linked.token);
    expect(none.status).toBe(404);
    expect(await none.json()).toEqual({ error: "not-found" });
    await seedLogo(db, a.workspaceId, new TextEncoder().encode("<svg onload=alert(1)>"));
    expect((await logo(linked.token)).status).toBe(404);
  });

  it("is a plain 404 for an anonymous, unknown or revoked link, or a trashed project", async () => {
    await seedLogo(db, a.workspaceId, PNG);
    expect((await logo(linked.token)).status).toBe(200);
    expect((await logo(anonymous.token)).status).toBe(404);
    expect((await logo("x".repeat(43))).status).toBe(404);
    expect((await logo("not-a-token")).status).toBe(404);

    await trashProject(db, a.workspaceId, "p1", NOW);
    expect((await logo(linked.token)).status).toBe(404);
    await db.query("UPDATE projects SET deleted_at = NULL");
    expect((await logo(linked.token)).status).toBe(200);

    await revokeShare(
      { store: createPostgresStore(db), blobs: inlineBackend },
      {
        id: linked.shareId,
      },
    );
    expect((await logo(linked.token)).status).toBe(404);
  });
});

describe("a logo on a link preview card", () => {
  const of = (bytes: Uint8Array, contentType: string): BrandLogo => ({
    bytes,
    contentType,
    version: "v",
  });

  it("is inlined as a data URI when the card can draw its type", () => {
    expect(cardLogoUri(of(PNG, "image/png"))).toBe(
      `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`,
    );
    expect(cardLogoUri(of(JPEG, "image/jpeg"))).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("is left off when the card can't draw it (WebP) or it's too large", () => {
    expect(cardLogoUri(of(WEBP, "image/webp"))).toBeNull();
    expect(cardLogoUri(of(new Uint8Array(2_000_000), "image/png"))).toBeNull();
  });
});
