import { afterEach, describe, expect, it, vi } from "vitest";
import type * as DatabaseModule from "@/lib/db/database";
import { STATE } from "@/test/share-fixture";
import { connectedWorkspace, type Intercept } from "@/test/workspace-client";
import { addFolder, PNG, seat, URL_PROJECT } from "@/test/workspace-fixture";
import type { Database } from "../db/database";
import { inlineBackend } from "../share/blob-backend";
import { createPostgresStore } from "../share/postgres-store";
import { createShare } from "../share/service";
import type { Comment, Project, Snapshot, SquintData } from "../store/types";
import { createProject } from "../workspace/projects";
import type { ImportDeps, ImportOutcome, LocalImport } from "./import-local";

const holder = vi.hoisted(() => ({ db: null as Database | null }));

vi.mock("@/lib/db/database", async (importOriginal) => ({
  ...(await importOriginal<typeof DatabaseModule>()),
  database: () => (holder.db ? Promise.resolve(holder.db) : null),
}));

let intercept: Intercept | null = null;

afterEach(() => {
  intercept = null;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const T = Date.UTC(2026, 9, 1);
const png = () => new Blob([PNG], { type: "image/png" });

function pagesProject(id: string, folderId: string, pageIds: string[]): Project {
  return {
    id,
    folderId,
    name: `Pages ${id}`,
    source: {
      kind: "pages",
      origin: "image",
      fileName: "home.png",
      pages: pageIds.map((page) => ({ id: page, blobKey: `page:${page}`, name: page })),
    },
    createdAt: T,
    updatedAt: T,
  };
}

const siteProject = (id: string, folderId: string): Project => ({
  id,
  folderId,
  name: `Site ${id}`,
  source: { kind: "url", url: "https://acme.example/" },
  createdAt: T,
  updatedAt: T,
});

const snapshot = (id: string, projectId: string): Snapshot => ({
  id,
  projectId,
  width: 1280,
  height: 2000,
  createdAt: T,
  blobKey: `snapshot:${id}`,
  sourceUrl: "https://acme.example/",
});

function comment(id: string, projectId: string, surface: Partial<Comment>): Comment {
  return {
    id,
    projectId,
    x: 10,
    y: 20,
    body: `Comment ${id}`,
    author: "Dailen",
    status: "active",
    createdAt: T,
    updatedAt: T,
    ...surface,
  };
}

/** Two folders, a page project, a website with a snapshot, comments with crops, one on a lost page. */
function browserData(overrides: Partial<SquintData> = {}): SquintData {
  return {
    version: 3,
    folders: [
      { id: "lf1", name: "Clients", createdAt: T, parentId: null },
      { id: "lf2", name: "Q4", createdAt: T, parentId: "lf1" },
    ],
    projects: [pagesProject("deck", "lf2", ["p1", "p2"]), siteProject("site", "lf1")],
    snapshots: [snapshot("s1", "site")],
    comments: [
      comment("c1", "deck", {
        pageId: "p1",
        crop: { blobKey: "crop:c1", rect: { x: 0, y: 0, width: 10, height: 10 } },
      }),
      comment("c2", "site", { snapshotId: "s1", author: "Client" }),
      comment("c3", "deck", { pageId: "gone" }),
    ],
    authorName: "Dailen",
    ...overrides,
  };
}

/** Every file of `browserData`, as this browser's image store holds them. */
const FILES = ["page:p1", "page:p2", "snapshot:s1", "crop:c1"];

interface Harness {
  db: Database;
  workspaceId: string;
  run: (local: LocalImport, overrides?: Partial<ImportDeps>) => Promise<ImportOutcome>;
  cleared: () => number;
  uploads: string[];
}

/** A connected workspace, and `run` importing into it through the real routes (inline uploads). */
async function harness(setUp?: (db: Database, workspaceId: string) => Promise<void>) {
  const { db, owner } = await connectedWorkspace(holder, { setUp, intercept: () => intercept });
  const { importLocalData } = await import("./import-local");
  const { uploadWorkspaceBlob } = await import("./blob-upload");
  const { call, jsonInit } = await import("../share-client/api");
  let clears = 0;
  const uploads: string[] = [];
  const result: Harness = {
    db,
    workspaceId: owner.workspaceId,
    uploads,
    cleared: () => clears,
    run: (local, overrides = {}) =>
      importLocalData(local, {
        send: (body) => call(`/api/w/${owner.workspaceId}/import`, jsonInit("POST", body)),
        upload: (projectId, key, blob) => {
          uploads.push(key);
          return uploadWorkspaceBlob(owner.workspaceId, projectId, key, blob);
        },
        readFile: (key) => Promise.resolve(FILES.includes(key) ? png() : null),
        clear: () => {
          clears += 1;
          return Promise.resolve();
        },
        ...overrides,
      }),
  };
  return result;
}

async function countRows(db: Database, table: "projects" | "comments" | "workspace_blobs") {
  const { rows } = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`);
  return rows[0]?.count;
}

const ok = (outcome: ImportOutcome) => {
  if (!outcome.ok) throw new Error(`import failed: ${outcome.failure}`);
  return outcome.report;
};

describe("importing this browser's data", () => {
  it("brings in folders, projects, comments and files, then clears the browser's copy", async () => {
    const h = await harness();
    const report = ok(await h.run({ data: browserData(), pendingImages: [] }));
    expect(report).toEqual({
      projects: 2,
      comments: 2,
      files: 4,
      skipped: [{ kind: "comments", projectName: "Pages deck", reason: "no-surface", count: 1 }],
      cleared: true,
    });
    expect(h.cleared()).toBe(1);
    expect(h.uploads.sort()).toEqual([...FILES].sort());
    expect(await countRows(h.db, "projects")).toBe(2);
    expect(await countRows(h.db, "comments")).toBe(2);
    expect(await countRows(h.db, "workspace_blobs")).toBe(4);
    const { rows } = await h.db.query<{ id: string; parent_id: string | null }>(
      "SELECT id, parent_id FROM folders WHERE id LIKE 'lf%' ORDER BY id",
    );
    expect(rows).toEqual([
      { id: "lf1", parent_id: null },
      { id: "lf2", parent_id: "lf1" },
    ]);
  });

  it("keeps the browser's copy when an upload fails, and a retry finishes without duplicates", async () => {
    const h = await harness();
    const local = { data: browserData(), pendingImages: [] };
    let failed = false;
    intercept = (request) => {
      if (request.method !== "PUT" || failed) return null;
      failed = true;
      return Promise.reject(new TypeError("network"));
    };
    expect(await h.run(local)).toEqual({ ok: false, failure: "offline" });
    expect(h.cleared()).toBe(0);
    const stored = await countRows(h.db, "workspace_blobs");
    expect(stored).toBeLessThan(4);

    h.uploads.length = 0;
    const report = ok(await h.run(local));
    expect(report).toMatchObject({ projects: 2, comments: 2, files: 4, cleared: true });
    // Only what was missing is sent again.
    expect(h.uploads).toHaveLength(4 - (stored ?? 0));
    expect(await countRows(h.db, "projects")).toBe(2);
    expect(await countRows(h.db, "comments")).toBe(2);
    expect(await countRows(h.db, "workspace_blobs")).toBe(4);
  });

  it("skips a project another workspace has, names it, imports the rest, and keeps the copy", async () => {
    const h = await harness(async (db) => {
      const other = await seat(db, "bravo");
      await addFolder(db, other.workspaceId);
      await createProject(db, other.workspaceId, URL_PROJECT("site"), T);
    });
    const report = ok(await h.run({ data: browserData(), pendingImages: [] }));
    expect(report.projects).toBe(1);
    expect(report.skipped).toContainEqual({
      kind: "project",
      projectName: "Site site",
      reason: "other-workspace",
    });
    expect(report.cleared).toBe(false);
    expect(h.cleared()).toBe(0);
    const { rows } = await h.db.query<{ id: string }>(
      "SELECT id FROM projects WHERE workspace_id = $1",
      [h.workspaceId],
    );
    expect(rows.map((row) => row.id)).toEqual(["deck"]);
  });

  it("reports an image this browser no longer has, and still clears", async () => {
    const h = await harness();
    const report = ok(
      await h.run(
        { data: browserData(), pendingImages: [] },
        { readFile: (key) => Promise.resolve(key === "page:p2" ? null : png()) },
      ),
    );
    expect(report.skipped).toContainEqual({
      kind: "file",
      projectName: "Pages deck",
      reason: "file-missing",
    });
    expect(report.files).toBe(3);
    expect(report.cleared).toBe(true);
  });

  it("stops without clearing when the image store can't be read", async () => {
    const h = await harness();
    const outcome = await h.run(
      { data: browserData(), pendingImages: [] },
      { readFile: () => Promise.reject(new Error("IndexedDB")) },
    );
    expect(outcome).toEqual({ ok: false, failure: "local-files" });
    expect(h.cleared()).toBe(0);
  });

  it("stops without clearing when signed out", async () => {
    const h = await harness();
    intercept = () => Promise.resolve(Response.json({ error: "unauthenticated" }, { status: 401 }));
    expect(await h.run({ data: browserData(), pendingImages: [] })).toEqual({
      ok: false,
      failure: "signed-out",
    });
    expect(h.cleared()).toBe(0);
  });

  it("attaches the browser's review link to the workspace, which stops its auto-delete", async () => {
    let shareId = "";
    const created: { token: string; ownerKey: string } = { token: "", ownerKey: "" };
    const h = await harness(async (db) => {
      const share = await createShare(
        { store: createPostgresStore(db), blobs: inlineBackend },
        STATE,
        Date.now(),
      );
      shareId = share.shareId;
      Object.assign(created, { token: share.token, ownerKey: share.ownerKey });
    });
    const data = browserData();
    const [deck, site] = data.projects;
    if (!deck || !site) throw new Error("fixture");
    const linked: Project = {
      ...site,
      share: { id: shareId, ...created, createdAt: Date.now(), cursor: 0 },
    };
    ok(await h.run({ data: { ...data, projects: [deck, linked] }, pendingImages: [] }));
    const { rows } = await h.db.query<{ workspace_id: string; expires_at: unknown }>(
      "SELECT workspace_id, expires_at FROM squint_shares WHERE id = $1",
      [shareId],
    );
    expect(rows).toEqual([{ workspace_id: h.workspaceId, expires_at: null }]);
  });

  it("uploads a version 1 image that's still inline", async () => {
    const h = await harness();
    const project = pagesProject("old", "lf1", []);
    const data = browserData({
      projects: [
        {
          ...project,
          source: {
            kind: "pages",
            origin: "image",
            fileName: "old.png",
            pages: [{ id: "page-1", blobKey: "image:old", name: "old.png" }],
          },
        },
      ],
      snapshots: [],
      comments: [],
    });
    const dataUrl = `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`;
    const report = ok(await h.run({ data, pendingImages: [{ key: "image:old", dataUrl }] }));
    expect(report).toMatchObject({ projects: 1, files: 1, cleared: true });
    expect(h.uploads).toEqual(["image:old"]);
  });
});

describe("planning batches", () => {
  it("packs projects in order under the budget, and sets apart one too big alone", async () => {
    const { bundleProjects, planBatches } = await import("./import-local");
    const data = browserData({
      projects: ["a", "b", "c", "d"].map((id) => siteProject(id, "lf1")),
      snapshots: [],
      comments: [comment("big", "d", { body: "x".repeat(400) })],
    });
    const bundles = bundleProjects(data);
    const small = bundles[0]?.bytes ?? 0;
    const { batches, oversized } = planBatches(bundles, small * 2 + 1);
    expect(batches.map((batch) => batch.map((bundle) => bundle.project.id))).toEqual([
      ["a", "b"],
      ["c"],
    ]);
    expect(oversized.map((bundle) => bundle.project.id)).toEqual(["d"]);
  });
});
