import { describe, expect, it } from "vitest";
import { exportFileName, pagePath, screenshotPath, slugify, snapshotPath } from "./paths";

describe("paths", () => {
  it("names files after the project and the local date", () => {
    expect(exportFileName("Acme *launch* [v2]", new Date(2026, 9, 4), "zip")).toBe(
      "acme-launch-v2-comments-2026-10-04.zip",
    );
    expect(exportFileName("Acme", new Date(2026, 9, 4), "md", "client")).toBe(
      "acme-comments-for-client-2026-10-04.md",
    );
    expect(slugify("Café Société")).toBe("cafe-societe");
    expect(slugify("***")).toBe("project");
  });

  it("pads screenshot numbers so they sort in pin order", () => {
    expect(screenshotPath({ number: 3, teamOnly: false }, "1a2b-3c4d-5e6f", 12, "image/jpeg")).toBe(
      "screenshots/03-1a2b3c4d.jpg",
    );
    expect(screenshotPath({ number: 7, teamOnly: false }, "abc", 120, "image/jpeg")).toBe(
      "screenshots/007-abc.jpg",
    );
    // Crops made before JPEG keep their PNG extension.
    expect(screenshotPath({ number: 7, teamOnly: false }, "abc", 120, "image/png")).toBe(
      "screenshots/007-abc.png",
    );
    // A team-only comment's is a T number, padded over the team-only count (D39).
    expect(screenshotPath({ number: 2, teamOnly: true }, "abc", 3, "image/jpeg")).toBe(
      "screenshots/T02-abc.jpg",
    );
    expect(snapshotPath("snap-1", "image/jpeg")).toBe("snapshots/snap-1.jpg");
    expect(snapshotPath("../x", "image/png")).toBe("snapshots/x.png");
  });

  it("names page images by page number, and screenshots by the page they're on", () => {
    expect(pagePath({ number: 2, total: 3 }, "image/webp")).toBe("pages/02.webp");
    expect(pagePath({ number: 7, total: 120 }, "image/jpeg")).toBe("pages/007.jpg");
    expect(
      screenshotPath({ number: 3, teamOnly: false }, "1a2b-3c4d", 12, "image/jpeg", {
        number: 2,
        total: 50,
      }),
    ).toBe("screenshots/03-p02-1a2b3c4d.jpg");
  });
});
