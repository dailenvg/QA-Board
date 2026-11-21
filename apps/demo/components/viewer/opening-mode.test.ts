import { describe, expect, it } from "vitest";
import type { FrameCheckState } from "@/lib/frame-check/use-frame-check";
import { openingMode, type OpeningFacts } from "./opening-mode";

const CHECKING: FrameCheckState = { status: "checking" };
const EMBEDDABLE: FrameCheckState = {
  status: "done",
  result: { verdict: "embeddable", finalUrl: "https://acme.example/", status: 200 },
};
const BLOCKED: FrameCheckState = {
  status: "done",
  result: { verdict: "blocked", reason: "x-frame-options", finalUrl: "https://acme.example/" },
};
const UNREACHABLE: FrameCheckState = {
  status: "done",
  result: { verdict: "unreachable", reason: "timeout" },
};
const UNKNOWN: FrameCheckState = {
  status: "done",
  result: { verdict: "unknown", reason: "check-failed" },
};

const site = (facts: Partial<OpeningFacts> = {}): OpeningFacts => ({
  website: true,
  draft: false,
  locked: false,
  remembered: null,
  frame: EMBEDDABLE,
  ...facts,
});

describe("the mode the viewer opens in", () => {
  it("opens a site that can be framed in Browse", () => {
    expect(openingMode(site())).toBe("browse");
  });

  it("opens a site that refuses framing in Comment mode", () => {
    expect(openingMode(site({ frame: BLOCKED }))).toBe("comment");
  });

  it("opens in Browse when the site can't be reached or the check can't tell", () => {
    expect(openingMode(site({ frame: UNREACHABLE }))).toBe("browse");
    expect(openingMode(site({ frame: UNKNOWN }))).toBe("browse");
  });

  it("waits while the frame check runs, so Browse never shows only to leave", () => {
    expect(openingMode(site({ frame: CHECKING }))).toBeNull();
  });

  it("opens a restored draft in Comment mode without waiting", () => {
    expect(openingMode(site({ draft: true, frame: CHECKING }))).toBe("comment");
    expect(openingMode(site({ draft: true, locked: true }))).toBe("comment");
  });

  it("opens in Browse while commenting is locked, even on a site that refuses framing", () => {
    expect(openingMode(site({ locked: true, frame: BLOCKED }))).toBe("browse");
    expect(openingMode(site({ locked: true, frame: CHECKING }))).toBe("browse");
  });

  it("opens image and PDF projects in Browse without a frame check", () => {
    expect(openingMode(site({ website: false, frame: CHECKING }))).toBe("browse");
  });

  it("opens in the mode last picked for the project", () => {
    expect(openingMode(site({ remembered: "comment" }))).toBe("comment");
    expect(openingMode(site({ remembered: "browse" }))).toBe("browse");
    expect(openingMode(site({ website: false, remembered: "comment" }))).toBe("comment");
  });

  it("opens in a remembered Comment mode without waiting for the frame check", () => {
    expect(openingMode(site({ remembered: "comment", frame: CHECKING }))).toBe("comment");
  });

  it("waits for the frame check before a remembered Browse", () => {
    expect(openingMode(site({ remembered: "browse", frame: CHECKING }))).toBeNull();
  });

  it("opens a site that refuses framing in Comment mode, whatever was remembered", () => {
    expect(openingMode(site({ remembered: "browse", frame: BLOCKED }))).toBe("comment");
  });

  it("opens in Browse while commenting is locked, whatever was remembered", () => {
    expect(openingMode(site({ remembered: "comment", locked: true }))).toBe("browse");
  });
});
