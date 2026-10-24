import type { SharedComment, SharedSnapshot, ShareRecord, ShareState } from "@/lib/share/types";

export const SNAPSHOT: SharedSnapshot = {
  id: "snap-1",
  width: 1280,
  height: 3000,
  createdAt: 1_000,
  sourceUrl: "https://acme.example/",
};

export const COMMENT: SharedComment = {
  id: "c-1",
  x: 10,
  y: 20,
  body: "Tighten the hero.",
  author: "Ana",
  status: "active",
  createdAt: 2_000,
  updatedAt: 2_000,
  snapshotId: "snap-1",
  crop: { rect: { x: 0, y: 0, width: 640, height: 400 } },
};

export const STATE: ShareState = {
  project: { name: "Acme", source: { kind: "url", url: "https://acme.example/" } },
  snapshots: [SNAPSHOT],
  comments: [COMMENT],
};

export const RECORD: ShareRecord = {
  id: "share-1",
  tokenHash: "a".repeat(64),
  ownerKeyHash: "b".repeat(64),
  project: STATE.project,
  createdAt: 1,
  updatedAt: 1,
};

/** The smallest valid PNG and JPEG headers, padded: enough for type sniffing. */
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
