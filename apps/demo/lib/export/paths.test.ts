import { describe, expect, it } from "vitest";
import { exportFileName, screenshotPath, slugify, snapshotPath } from "./paths";

describe("paths", () => {
  it("names files after the project and the local date", () => {
    expect(exportFileName("Acme *launch* [v2]", new Date(2026, 9, 4), "zip")).toBe(
      "acme-launch-v2-comments-2026-10-04.zip",
    );
    expect(slugify("Café Société")).toBe("cafe-societe");
    expect(slugify("***")).toBe("project");
  });

  it("pads screenshot numbers so they sort in pin order", () => {
    expect(screenshotPath(3, "1a2b-3c4d-5e6f", 12)).toBe("screenshots/03-1a2b3c4d.png");
    expect(screenshotPath(7, "abc", 120)).toBe("screenshots/007-abc.png");
    expect(snapshotPath("snap-1", "image/jpeg")).toBe("snapshots/snap-1.jpg");
    expect(snapshotPath("../x", "image/png")).toBe("snapshots/x.png");
  });
});
