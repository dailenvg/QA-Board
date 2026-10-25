/**
 * `squint:v1` exactly as Squint saved it before snapshots existed: no
 * `snapshots` list, and comments without `snapshotId` or `crop`.
 */
export const LEGACY_V1 = {
  version: 1,
  folders: [{ id: "default", name: "My projects", createdAt: 1_700_000_000_000 }],
  projects: [
    {
      id: "site",
      folderId: "default",
      name: "Marketing site",
      source: { kind: "url", url: "https://example.com/" },
      createdAt: 1_700_000_000_100,
      updatedAt: 1_700_000_000_400,
    },
    {
      id: "mock",
      folderId: "default",
      name: "Checkout mockup",
      source: { kind: "image", dataUrl: "data:image/webp;base64,AAAA", fileName: "checkout.png" },
      createdAt: 1_700_000_000_200,
      updatedAt: 1_700_000_000_300,
    },
  ],
  comments: [
    {
      id: "c1",
      projectId: "site",
      x: 12.5,
      y: 40,
      body: "Tighten the hero copy.",
      author: "Ana",
      status: "active",
      createdAt: 1_700_000_000_400,
      updatedAt: 1_700_000_000_400,
    },
    {
      id: "c2",
      projectId: "mock",
      x: 50,
      y: 60,
      body: "Bigger button.",
      author: "Leo",
      status: "resolved",
      createdAt: 1_700_000_000_300,
      updatedAt: 1_700_000_000_350,
      resolvedAt: 1_700_000_000_350,
    },
  ],
  authorName: "Ana",
} as const;

/**
 * `squint:v2` as Squint saved it before pages: the image in the blob store,
 * folders without parents, and a comment on a snapshot from the image
 * project's website days.
 */
export const LEGACY_V2 = {
  ...LEGACY_V1,
  version: 2,
  projects: [
    LEGACY_V1.projects[0],
    {
      ...LEGACY_V1.projects[1],
      source: {
        kind: "image",
        blobKey: "image:mock",
        fileName: "checkout.png",
        referenceUrl: "https://example.com/checkout",
      },
    },
  ],
  comments: [
    ...LEGACY_V1.comments,
    { ...LEGACY_V1.comments[1], id: "c3", snapshotId: "s1", status: "active" },
  ],
  snapshots: [
    {
      id: "s1",
      projectId: "mock",
      width: 1280,
      height: 3000,
      createdAt: 1_700_000_000_250,
      blobKey: "snapshot:s1",
      sourceUrl: "https://example.com/checkout",
    },
  ],
  revocations: [],
} as const;
