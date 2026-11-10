import { describe, expect, it } from "vitest";
import { contrast } from "@/lib/color";
import { accentStyle, darkAccent } from "./brand-accent";

const DARK_CARD = "#27272c";
const DARK_PANEL = "#1b1b1f";

describe("darkAccent", () => {
  it("keeps a color that already reads on dark surfaces", () => {
    expect(darkAccent("#e03b9d")).toBe("#E03B9D");
  });

  it.each(["#012d61", "#000000", "#0c54cc", "#3a0d0d"])(
    "lifts %s until it reads 3:1 on the dark card and panel",
    (color) => {
      const lifted = darkAccent(color);
      expect(lifted).not.toBe(color.toUpperCase());
      expect(contrast(lifted, DARK_CARD)).toBeGreaterThanOrEqual(3);
      expect(contrast(lifted, DARK_PANEL)).toBeGreaterThanOrEqual(3);
    },
  );

  it("lifts no further than it needs to", () => {
    // Navy needs a real lift, but stays a tint of itself, not white.
    expect(darkAccent("#012d61")).not.toBe("#FFFFFF");
  });
});

describe("accentStyle", () => {
  it("sets both themes' accents from the company color", () => {
    expect(accentStyle("#012d61")).toEqual({
      "--guest-accent": "#012d61",
      "--guest-accent-dark": darkAccent("#012d61"),
    });
  });

  it("sets nothing without a color", () => {
    expect(accentStyle(null)).toBeUndefined();
  });
});
