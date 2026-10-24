import type { ExportInput } from "@/lib/export/build-document";
import type { Comment, Project, Snapshot } from "@/lib/store/types";

const T0 = Date.UTC(2026, 9, 24, 9, 0, 0);

export const EXPORTED_AT = Date.UTC(2026, 9, 24, 12, 30, 0);

export const URL_PROJECT: Project = {
  id: "proj-1",
  folderId: "default",
  name: "Acme *launch* [v2]",
  source: { kind: "url", url: "https://acme.example/pricing?plan=pro" },
  createdAt: T0,
  updatedAt: T0 + 50_000,
};

export const OLD_SNAPSHOT: Snapshot = {
  id: "snap-old",
  projectId: "proj-1",
  width: 1280,
  height: 4000,
  createdAt: T0 + 1_000,
  blobKey: "snapshot:snap-old",
  sourceUrl: "https://acme.example/pricing?plan=pro",
};

export const NEW_SNAPSHOT: Snapshot = {
  ...OLD_SNAPSHOT,
  id: "snap-new",
  createdAt: T0 + 30_000,
  blobKey: "snapshot:snap-new",
};

const base = { projectId: "proj-1", status: "active" as const };

/** In pin order: a legacy frame pin, one on the old snapshot (resolved), one on the new. */
export const URL_COMMENTS: Comment[] = [
  {
    ...base,
    id: "aaaa1111-legacy",
    x: 10,
    y: 20,
    body: "Logo looks blurry.",
    author: "Ana",
    createdAt: T0 + 500,
    updatedAt: T0 + 500,
  },
  {
    ...base,
    id: "bbbb2222-old",
    x: 50,
    y: 25,
    body: "Hero headline should say *Pricing*.",
    author: "Leo",
    status: "resolved",
    createdAt: T0 + 2_000,
    updatedAt: T0 + 2_000,
    resolvedAt: T0 + 40_000,
    snapshotId: "snap-old",
    crop: { blobKey: "crop:bbbb2222-old", rect: { x: 0, y: 600, width: 1280, height: 800 } },
  },
  {
    ...base,
    id: "cccc3333-new",
    x: 33.33,
    y: 75.5,
    // Hostile text: headings, fences, links, HTML. It must stay one comment's request.
    body: "# Not a heading\n```\n## Not a section\n```\n[click](javascript:alert(1)) <img src=x onerror=alert(1)>",
    author: "Mia **[admin]**",
    createdAt: T0 + 31_000,
    updatedAt: T0 + 45_000,
    snapshotId: "snap-new",
    crop: { blobKey: "crop:cccc3333-new", rect: { x: 0, y: 2600, width: 1280, height: 800 } },
  },
];

/** The ZIP case: every crop and snapshot stored, and the old snapshot too big to include. */
export const URL_EXPORT: ExportInput = {
  project: URL_PROJECT,
  comments: URL_COMMENTS,
  snapshots: [NEW_SNAPSHOT, OLD_SNAPSHOT],
  assets: {
    crops: new Set(["bbbb2222-old", "cccc3333-new"]),
    snapshots: new Map([
      ["snap-new", { file: "snapshots/snap-new.jpg" }],
      ["snap-old", { omitted: "too-large" as const }],
    ]),
    image: null,
  },
  exportedAt: EXPORTED_AT,
};

export const IMAGE_EXPORT: ExportInput = {
  project: {
    id: "proj-2",
    folderId: "default",
    name: "Checkout mockup",
    source: { kind: "image", dataUrl: "data:image/png;base64,AAAA", fileName: "checkout.png" },
    createdAt: T0,
    updatedAt: T0,
  },
  comments: [
    {
      id: "dddd4444",
      projectId: "proj-2",
      x: 25,
      y: 50,
      body: "Bigger button.",
      author: "Leo",
      status: "active",
      createdAt: T0 + 100,
      updatedAt: T0 + 100,
    },
  ],
  snapshots: [],
  assets: {
    crops: new Set(),
    snapshots: new Map(),
    image: { width: 1200, height: 900, file: "source-image.png" },
  },
  exportedAt: EXPORTED_AT,
};
