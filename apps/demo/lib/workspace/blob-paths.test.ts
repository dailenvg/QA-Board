import { describe, expect, it } from "vitest";
import { blobLimit, blobPath, parseBlobKey, parseBlobPath } from "./blob-paths";

const WS = "0b9c6a4e-6f0c-4b8a-9d3e-2f1a5c7d9e01";

describe("blob paths", () => {
  it("builds the fixed path of a project file from a logical key, and parses it back", () => {
    const path = blobPath(WS, "p1", "page:page-1");
    expect(path).toBe(`ws/${WS}/project/p1/page/page-1`);
    expect(parseBlobPath(path)).toEqual({ workspaceId: WS, projectId: "p1", key: "page:page-1" });
    expect(blobPath(WS, "p1", "image:p1")).toBe(`ws/${WS}/project/p1/image/p1`);
  });

  it("refuses anything that could leave the project's folder", () => {
    for (const key of ["page:../x", "page:a/b", "logo:x", "page:", "crop:a:1"]) {
      expect(parseBlobKey(key)).toBeNull();
      expect(() => blobPath(WS, "p1", key)).toThrow();
    }
    expect(() => blobPath(WS, "../p", "page:a")).toThrow();
    expect(() => blobPath("not-a-uuid", "p1", "page:a")).toThrow();
    expect(parseBlobPath(`ws/${WS}/logo/x`)).toBeNull();
    expect(parseBlobPath(`squint/share/page-1`)).toBeNull();
  });

  it("limits each kind like a share does", () => {
    expect(blobLimit("crop:c")).toBeLessThan(blobLimit("snapshot:s"));
    expect(blobLimit("snapshot:s")).toBeLessThan(blobLimit("page:p"));
    expect(blobLimit("image:p")).toBe(blobLimit("page:p"));
  });
});
