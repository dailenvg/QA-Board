import { SQUINT_BRAND, toClientBrand } from "@/lib/share/brand";
import { shareExpiresAt } from "@/lib/share/retention";
import { DEFAULT_REVIEW_WINDOW_HOURS, reviewDeadline } from "@/lib/share/review-window";
import type {
  ClientView,
  SharedComment,
  SharedSnapshot,
  ShareRecord,
  ShareState,
} from "@/lib/share/types";

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

/** An anonymous share, so it always has a deletion date. */
export const RECORD = {
  id: "share-1",
  tokenHash: "a".repeat(64),
  ownerKeyHash: "b".repeat(64),
  project: STATE.project,
  createdAt: 1,
  updatedAt: 1,
  expiresAt: shareExpiresAt(STATE.project, 1),
  reviewWindowHours: DEFAULT_REVIEW_WINDOW_HOURS,
} satisfies ShareRecord;

/** What a client of `RECORD` sees. */
export const VIEW: ClientView = {
  ...STATE,
  brand: toClientBrand(SQUINT_BRAND),
  reviewEndsAt: reviewDeadline(RECORD.createdAt, RECORD.reviewWindowHours),
  reviewWindowHours: RECORD.reviewWindowHours,
  expiresAt: RECORD.expiresAt,
};

/** The smallest valid PNG and JPEG headers, padded: enough for type sniffing. */
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

/**
 * A reviewer-name memory kept in a list, for client store tests: `saved` is
 * every name remembered, and `legacy` is carried over once, as from the old key.
 */
export function namesInMemory(legacy: string | null = null) {
  const saved: string[] = [];
  let old = legacy;
  return {
    saved,
    save: (name: string) => void saved.push(name),
    carryOver() {
      const name = old;
      old = null;
      if (name) saved.push(name);
      return name;
    },
  };
}
