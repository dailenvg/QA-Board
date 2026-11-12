import { describe, expect, it } from "vitest";
import type { ProjectShare } from "@/lib/store/types";
import { shareButtonState } from "./share-button-state";

const HOUR = 60 * 60 * 1000;
const SHARE: ProjectShare = {
  id: "s",
  token: "t",
  ownerKey: "k",
  createdAt: 0,
  cursor: 0,
  reviewWindowHours: 24,
  reviewEndsAt: 24 * HOUR,
};

describe("the Share button", () => {
  it("says the link is on while it works, and when its review window has closed", () => {
    expect(shareButtonState(SHARE, "idle", HOUR)).toEqual({
      linked: true,
      closed: false,
      label: "Share, link is on",
    });
    expect(shareButtonState(SHARE, "syncing", 25 * HOUR)).toEqual({
      linked: true,
      closed: true,
      label: "Share, link is on, review window closed",
    });
  });

  it("reads as no link once the server no longer has it, closed or not", () => {
    const none = { linked: false, closed: false, label: "Share" };
    expect(shareButtonState(SHARE, "gone", HOUR)).toEqual(none);
    expect(shareButtonState(SHARE, "gone", 25 * HOUR)).toEqual(none);
    expect(shareButtonState(undefined, "idle", HOUR)).toEqual(none);
  });

  it("never closes a link without a limit, nor before the browser has a clock", () => {
    const open = { ...SHARE, reviewWindowHours: null, reviewEndsAt: null };
    expect(shareButtonState(open, "idle", 1_000 * HOUR).closed).toBe(false);
    expect(shareButtonState(SHARE, "idle", 0).closed).toBe(false);
  });
});
