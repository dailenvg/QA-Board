import { describe, expect, it } from "vitest";
import {
  activeByBreakpoint,
  BREAKPOINTS,
  BREAKPOINT_WIDTH,
  breakpointOf,
  breakpointOfComment,
} from "./breakpoints";
import type { Comment, Snapshot } from "./types";

const snapshot = (id: string, width: number): Snapshot => ({
  id,
  projectId: "p",
  width,
  height: 3000,
  createdAt: 1,
  blobKey: `snapshot:${id}`,
  sourceUrl: "https://example.com/",
});

const comment = (snapshotId?: string, status: Comment["status"] = "active"): Comment => ({
  id: "c",
  projectId: "p",
  x: 1,
  y: 1,
  body: "b",
  author: "a",
  status,
  createdAt: 1,
  updatedAt: 1,
  ...(snapshotId ? { snapshotId } : {}),
});

describe("breakpointOf", () => {
  it("maps each breakpoint's own capture width back to it", () => {
    for (const breakpoint of BREAKPOINTS) {
      expect(breakpointOf(BREAKPOINT_WIDTH[breakpoint])).toBe(breakpoint);
    }
  });

  it("places stage-width snapshots from before breakpoints at the band edges", () => {
    expect(breakpointOf(2560)).toBe("desktop");
    expect(breakpointOf(1024)).toBe("desktop");
    expect(breakpointOf(1023)).toBe("tablet");
    expect(breakpointOf(640)).toBe("tablet");
    expect(breakpointOf(639)).toBe("mobile");
    expect(breakpointOf(320)).toBe("mobile");
  });
});

describe("breakpointOfComment", () => {
  const snapshots = new Map([
    ["wide", snapshot("wide", 1440)],
    ["phone", snapshot("phone", 390)],
  ]);

  it("follows the comment's snapshot", () => {
    expect(breakpointOfComment(comment("wide"), snapshots)).toBe("desktop");
    expect(breakpointOfComment(comment("phone"), snapshots)).toBe("mobile");
  });

  it("lists frame-anchored comments and ones on a missing snapshot under Desktop", () => {
    expect(breakpointOfComment(comment(), snapshots)).toBe("desktop");
    expect(breakpointOfComment(comment("gone"), snapshots)).toBe("desktop");
  });
});

describe("activeByBreakpoint", () => {
  it("counts each breakpoint's open comments, leaving resolved ones out", () => {
    const snapshots = new Map([
      ["wide", snapshot("wide", 1440)],
      ["pad", snapshot("pad", 768)],
    ]);
    const comments = [comment("wide"), comment(), comment("pad"), comment("pad", "resolved")];
    expect(activeByBreakpoint(comments, snapshots)).toEqual({ desktop: 2, tablet: 1, mobile: 0 });
  });
});
