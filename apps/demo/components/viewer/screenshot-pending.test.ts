import { describe, expect, it } from "vitest";
import type { Comment } from "@/lib/store/types";
import { isScreenshotPending } from "./screenshot-pending";

const base: Comment = {
  id: "c-1",
  projectId: "p1",
  x: 1,
  y: 1,
  body: "Hi",
  author: "Cleo",
  status: "active",
  createdAt: 1,
  updatedAt: 1,
};
const crop = { blobKey: "crop:c-1", rect: { x: 0, y: 0, width: 1, height: 1 } };

describe("isScreenshotPending", () => {
  it("is what a review link's server says", () => {
    expect(isScreenshotPending({ ...base, screenshotPending: true })).toBe(true);
  });

  it("is a client's comment without a crop, in the workspace", () => {
    expect(isScreenshotPending({ ...base, fromClient: true })).toBe(true);
    expect(isScreenshotPending({ ...base, fromClient: true, crop })).toBe(false);
  });

  it("is never the team's own comment, with a crop or not", () => {
    expect(isScreenshotPending(base)).toBe(false);
    expect(isScreenshotPending({ ...base, crop })).toBe(false);
  });
});
