import { describe, expect, it } from "vitest";
import { openUntil } from "../viewer/review-window-summary";
import { shareLinkWarning } from "./share-link-warning";

const NOW = Date.UTC(2026, 10, 20, 15, 0);
const HOUR = 3_600_000;
const SOON = NOW + 5 * HOUR;
const LATER = NOW + 72 * HOUR;
const PAST = NOW - 2 * HOUR;

describe("share link warning", () => {
  it("says nothing without a share link", () => {
    expect(shareLinkWarning([], NOW, "project")).toBeNull();
    expect(shareLinkWarning([], NOW, "folder")).toBeNull();
  });

  it("names when a project's link is open until", () => {
    expect(shareLinkWarning([LATER], NOW, "project")).toBe(
      `Clients with its share link will lose access. The link is open until ${openUntil(LATER)}.`,
    );
  });

  it("says plainly when a link has no end date, without inventing one", () => {
    expect(shareLinkWarning([null], NOW, "project")).toBe(
      "Clients with its share link will lose access. The link has no end date.",
    );
  });

  it("still warns for a link whose review window has closed, saying when it did", () => {
    expect(shareLinkWarning([PAST], NOW, "project")).toBe(
      `Clients with its share link will lose access. Its review window closed ${openUntil(PAST)}.`,
    );
    // Before the browser has a clock, nothing reads as closed.
    expect(shareLinkWarning([PAST], 0, "project")).toContain(`open until ${openUntil(PAST)}`);
  });

  it("counts a folder's links and names the one that ends last", () => {
    expect(shareLinkWarning([SOON], NOW, "folder")).toBe(
      `Clients with the share link inside will lose access. The link is open until ${openUntil(SOON)}.`,
    );
    expect(shareLinkWarning([SOON, LATER, PAST], NOW, "folder")).toBe(
      `Clients with the 3 share links inside will lose access. The last one is open until ${openUntil(LATER)}.`,
    );
    expect(shareLinkWarning([SOON, null], NOW, "folder")).toBe(
      "Clients with the 2 share links inside will lose access. At least one has no end date.",
    );
    expect(shareLinkWarning([PAST, PAST - HOUR], NOW, "folder")).toBe(
      `Clients with the 2 share links inside will lose access. The last review window closed ${openUntil(PAST)}.`,
    );
  });

  it("has no em-dashes", () => {
    for (const ends of [[LATER], [null], [PAST], [SOON, LATER], [SOON, null]]) {
      expect(shareLinkWarning(ends, NOW, "folder")).not.toContain("—");
      expect(shareLinkWarning(ends, NOW, "project")).not.toContain("—");
    }
  });
});
