import { describe, expect, it } from "vitest";
import type { CaptureState } from "@/lib/capture/use-capture";
import { shownCaptureState, type CaptureContext } from "./shown-capture-state";

const IDLE: CaptureState = { status: "idle" };
const CAPTURING: CaptureState = { status: "capturing" };
const FAILED: CaptureState = { status: "failed", message: "Nope." };
const PARTIAL: CaptureState = { status: "idle", partial: { snapshotId: "s1" } };

const at = (context: Partial<CaptureContext> = {}): CaptureContext => ({
  capturedFor: "desktop",
  breakpoint: "desktop",
  latestId: "s1",
  ...context,
});

describe("the capture state the stage shows", () => {
  it("shows a capture in flight on every breakpoint", () => {
    expect(shownCaptureState(CAPTURING, at({ breakpoint: "mobile" }))).toBe(CAPTURING);
  });

  it("shows a failure only on the breakpoint it was for", () => {
    expect(shownCaptureState(FAILED, at())).toBe(FAILED);
    expect(shownCaptureState(FAILED, at({ breakpoint: "mobile", latestId: "m1" }))).toEqual(IDLE);
  });

  it("shows a partial page while its snapshot is the latest", () => {
    expect(shownCaptureState(PARTIAL, at())).toBe(PARTIAL);
  });

  it("drops the partial note once a newer snapshot from elsewhere is the latest", () => {
    expect(shownCaptureState(PARTIAL, at({ latestId: "s2" }))).toEqual(IDLE);
  });

  it("drops the partial note on another breakpoint", () => {
    expect(shownCaptureState(PARTIAL, at({ breakpoint: "mobile", latestId: "m1" }))).toEqual(IDLE);
    expect(shownCaptureState(PARTIAL, at({ breakpoint: "mobile", latestId: null }))).toEqual(IDLE);
  });
});
