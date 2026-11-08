import { afterEach, describe, expect, it, vi } from "vitest";
import { NAVY, PAPER } from "./brand-palette";
import { contrast } from "./color";
import { monogram, monogramInitials, MONOGRAM_NEUTRAL } from "./monogram";

describe("monogramInitials", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("takes the first letters of the first two words, as capitals", () => {
    expect(monogramInitials("ONE Agency")).toBe("OA");
    expect(monogramInitials("  acme  design  studio ")).toBe("AD");
    expect(monogramInitials("Acme")).toBe("A");
    expect(monogramInitials("Étoile Studio")).toBe("ÉS");
    expect(monogramInitials("3M")).toBe("3");
  });

  it("skips symbols in a word, and keeps the first character of a name with nothing else", () => {
    expect(monogramInitials("(Parens) & Co")).toBe("PC");
    expect(monogramInitials("★★★")).toBe("★");
    expect(monogramInitials("   ")).toBe("");
  });

  it("capitalizes the same whatever the default locale, so server and browser agree", () => {
    // A Turkish default locale capitalizes "i" as a dotted "İ".
    vi.spyOn(String.prototype, "toLocaleUpperCase").mockImplementation(function (this: string) {
      return this.replaceAll("i", "İ").toUpperCase();
    });
    expect(monogramInitials("ivy studio")).toBe("IS");
    expect(monogramInitials("ılık iris")).toBe("II");
  });
});

describe("monogram", () => {
  it("sits on the brand color with whichever ink reads on it", () => {
    expect(monogram("Acme", "#1157ce")).toEqual({
      initials: "A",
      background: "#1157ce",
      ink: PAPER,
    });
    const light = monogram("Acme", "#e1fd73");
    expect(light.ink).toBe(NAVY);
    expect(contrast(light.background, light.ink)).toBeGreaterThanOrEqual(3);
  });

  it("uses the neutral navy without a brand color", () => {
    expect(monogram("ONE Agency", null)).toEqual({
      initials: "OA",
      background: MONOGRAM_NEUTRAL,
      ink: PAPER,
    });
  });
});
