import { describe, expect, it } from "vitest";
import { openUntil } from "../viewer/review-window-summary";
import { shareLinkWarning, wrappableOpenUntil } from "./share-link-warning";

const NOW = Date.UTC(2026, 10, 20, 15, 0);
const HOUR = 3_600_000;
const SOON = NOW + 5 * HOUR;
const LATER = NOW + 72 * HOUR;
const PAST = NOW - 2 * HOUR;

/** As the warning names an end: wrapping only between its date and its time. */
const until = wrappableOpenUntil;

describe("the warning's end time", () => {
  it("reads as openUntil, wrapping only between the date and the time", () => {
    const shown = until(LATER);
    expect(shown.replace(/\s/g, " ")).toBe(openUntil(LATER).replace(/\s/g, " "));
    // One place a line may break: after "·", before the time.
    expect(shown.match(/[ \t\n]/g)).toEqual([" "]);
    const [date, time] = shown.split(" ");
    expect(date).toMatch(/^\w{3},\u00a0\w{3}\u00a0\d{1,2}\u00a0·$/);
    expect(time).toMatch(/^\d{1,2}:\d{2}\u00a0[AP]M$/);
  });
});

describe("share link warning", () => {
  it("says nothing without a share link", () => {
    expect(shareLinkWarning([], NOW, "project")).toBeNull();
    expect(shareLinkWarning([], NOW, "folder")).toBeNull();
  });

  it("names when a project's link is open until", () => {
    expect(shareLinkWarning([LATER], NOW, "project")).toBe(
      `Clients with its share link will lose access. The link is open until ${until(LATER)}.`,
    );
  });

  it("says plainly when a link has no end date, without inventing one", () => {
    expect(shareLinkWarning([null], NOW, "project")).toBe(
      "Clients with its share link will lose access. The link has no end date.",
    );
  });

  it("still warns for a link whose review window has closed, saying when it did", () => {
    expect(shareLinkWarning([PAST], NOW, "project")).toBe(
      `Clients with its share link will lose access. Its review window closed ${until(PAST)}.`,
    );
    // Before the browser has a clock, nothing reads as closed.
    expect(shareLinkWarning([PAST], 0, "project")).toContain(`open until ${until(PAST)}`);
  });

  it("counts a folder's links and names the one that ends last", () => {
    expect(shareLinkWarning([SOON], NOW, "folder")).toBe(
      `Clients with the share link inside will lose access. The link is open until ${until(SOON)}.`,
    );
    expect(shareLinkWarning([SOON, LATER, PAST], NOW, "folder")).toBe(
      `Clients with the 3 share links inside will lose access. The last one is open until ${until(LATER)}.`,
    );
    expect(shareLinkWarning([SOON, null], NOW, "folder")).toBe(
      "Clients with the 2 share links inside will lose access. At least one has no end date.",
    );
    expect(shareLinkWarning([PAST, PAST - HOUR], NOW, "folder")).toBe(
      `Clients with the 2 share links inside will lose access. The last review window closed ${until(PAST)}.`,
    );
  });

  it("has no em-dashes", () => {
    for (const ends of [[LATER], [null], [PAST], [SOON, LATER], [SOON, null]]) {
      expect(shareLinkWarning(ends, NOW, "folder")).not.toContain("—");
      expect(shareLinkWarning(ends, NOW, "project")).not.toContain("—");
    }
  });
});
