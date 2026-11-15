import { describe, expect, it } from "vitest";
import type { ApiResult } from "@/lib/share-client/api";
import type { CreatedShare } from "@/lib/share/types";
import type { Result } from "@/lib/store/store";
import { createsOnOpen, makeShareLink, type MakeLinkSteps } from "./make-share-link";

const CREATED: CreatedShare = {
  shareId: "s1",
  token: "t".repeat(43),
  ownerKey: "k".repeat(43),
  missingBlobs: [],
  createdAt: 1,
  expiresAt: 2,
};
const OK: Result = { ok: true, value: undefined };
const REFUSED: Result = {
  ok: false,
  error: "You can no longer change this link. Ask Dailen if you need to.",
  notAllowed: "links.manage",
};

/** Steps that record what reached the server. */
function steps(answers: { unshare?: Result; attach?: Result; create?: ApiResult<CreatedShare> }) {
  const calls: string[] = [];
  const made: MakeLinkSteps = {
    unshare: () => {
      calls.push("DELETE share-link");
      return Promise.resolve(answers.unshare ?? OK);
    },
    create: () => {
      calls.push("POST /api/shares");
      return Promise.resolve(answers.create ?? { ok: true, value: CREATED });
    },
    attach: () => {
      calls.push("PUT share-link");
      return Promise.resolve(answers.attach ?? OK);
    },
    discard: (created) => {
      calls.push(`DELETE /api/shares/${created.shareId}`);
      return Promise.resolve();
    },
  };
  return { calls, made };
}

describe("opening Share", () => {
  it("never makes a link for a member without the review-links switch", () => {
    expect(createsOnOpen(false, false, false, false)).toBe(false);
    expect(createsOnOpen(false, true, true, false)).toBe(false);
  });

  it("makes one for whoever may, when there's none or it stopped working", () => {
    expect(createsOnOpen(true, false, false, false)).toBe(true);
    expect(createsOnOpen(true, true, true, false)).toBe(true);
    expect(createsOnOpen(true, true, false, false)).toBe(false);
    expect(createsOnOpen(true, false, false, true)).toBe(false);
  });
});

describe("making a link", () => {
  it("makes and attaches a share", async () => {
    const { calls, made } = steps({});
    expect(await makeShareLink(false, made)).toEqual({ ok: true, created: CREATED });
    expect(calls).toEqual(["POST /api/shares", "PUT share-link"]);
  });

  it("deletes the share an attach refused for a switch turned off, so nothing stays", async () => {
    const { calls, made } = steps({ attach: REFUSED });
    expect(await makeShareLink(false, made)).toEqual({ ok: false, refused: true });
    expect(calls).toEqual(["POST /api/shares", "PUT share-link", "DELETE /api/shares/s1"]);
  });

  it("stops before making anything when taking the gone link away is refused", async () => {
    const { calls, made } = steps({ unshare: REFUSED });
    expect(await makeShareLink(true, made)).toEqual({ ok: false, refused: true });
    expect(calls).toEqual(["DELETE share-link"]);
  });

  it("keeps an attach's other failures as they were: the share stays for a retry's cleanup", async () => {
    const failed: Result = { ok: false, error: "That change didn't save." };
    const { calls, made } = steps({ attach: failed });
    expect(await makeShareLink(false, made)).toEqual({
      ok: false,
      refused: false,
      message: "That change didn't save.",
    });
    expect(calls).not.toContain("DELETE /api/shares/s1");
  });
});
