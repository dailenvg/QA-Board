import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CORAL_RED, FOREST_GREEN, MINT_GREEN } from "./brand-palette";
import { contrast, mix } from "./color";

/**
 * The status colors in globals.css (open comments, resolved, danger), measured
 * the way they're drawn: text at 4.5:1 and marks at 3:1 (WCAG 1.4.3 and
 * 1.4.11) on every surface they sit on, and on their own -soft tints laid over
 * those surfaces.
 */

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

/** The custom properties of the first rule whose selector is exactly `selector`. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`No "${selector}" rule in globals.css.`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  const tokens = new Map<string, string>();
  for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    if (name && value) tokens.set(name, value.trim().toLowerCase());
  }
  return tokens;
}

const LIGHT = block(":root");
/** The dark theme sets only what changes; the rest comes from :root. */
const DARK = new Map([...LIGHT, ...block('[data-theme="dark"]')]);
/** Light mock-ups inside dark illustrations, on their dimmer card and tile. */
const MOCK = new Map([...DARK, ...block('[data-theme="dark"] .mock-light')]);

const TEXT = 4.5;
const MARK = 3;

/** A token as an opaque hex: `rgb(r g b / a)` is laid over `surface`. */
function color(theme: Map<string, string>, name: string, surface = "#ffffff"): string {
  const value = theme.get(name);
  if (!value) throw new Error(`No --${name}.`);
  if (value.startsWith("#")) return value;
  const rgba = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/.exec(value);
  if (!rgba) throw new Error(`--${name} is neither a hex nor rgb(r g b / a): ${value}`);
  const [, r, g, b, alpha] = rgba.map(Number) as [number, number, number, number, number];
  const hex = `#${[r, g, b].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
  return mix(surface, hex, alpha);
}

/** The theme's surface colors by name. */
function surfaces(theme: Map<string, string>, names: readonly string[]): string[] {
  return names.map((name) => color(theme, name));
}

/** The lowest contrast of `foreground` on any of `backgrounds`. */
function worst(foreground: string, backgrounds: readonly string[]): number {
  return Math.min(...backgrounds.map((background) => contrast(foreground, background)));
}

/** `soft` laid over each surface. */
function softOver(theme: Map<string, string>, soft: string, under: readonly string[]): string[] {
  return under.map((surface) => color(theme, soft, surface));
}

const ALL_SURFACES = ["card", "panel", "bg", "tile"] as const;

describe.each([
  { theme: "light", tokens: LIGHT },
  { theme: "dark", tokens: DARK },
])("the $theme theme's status colors", ({ tokens }) => {
  const under = surfaces(tokens, ALL_SURFACES);

  it("reads red text (counts, errors, the last day) at 4.5:1 on every surface and its -soft", () => {
    for (const [text, soft] of [
      ["comments-text", "comments-soft"],
      ["danger", "danger-soft"],
    ] as const) {
      const red = color(tokens, text);
      expect(worst(red, under), text).toBeGreaterThanOrEqual(TEXT);
      expect(
        worst(red, softOver(tokens, soft, under)),
        `${text} on ${soft}`,
      ).toBeGreaterThanOrEqual(TEXT);
    }
  });

  it("keeps one red: errors and the deletion notice match", () => {
    expect(tokens.get("danger")).toBe(tokens.get("comments-text"));
  });

  it("carries --card text on danger fills at 4.5:1", () => {
    expect(contrast(color(tokens, "danger"), color(tokens, "card"))).toBeGreaterThanOrEqual(TEXT);
  });

  it("draws open comments' marks at 3:1 on cards, panels and tiles", () => {
    const open = color(tokens, "comments");
    expect(worst(open, surfaces(tokens, ["card", "panel", "tile"]))).toBeGreaterThanOrEqual(MARK);
  });

  it("draws resolved marks at 3:1 on every surface and beside open ones", () => {
    const resolved = color(tokens, "resolved");
    expect(worst(resolved, under)).toBeGreaterThanOrEqual(MARK);
    expect(contrast(resolved, color(tokens, "comments"))).toBeGreaterThanOrEqual(MARK);
  });

  it("reads resolved text at 4.5:1 on every surface and on its badge", () => {
    const text = color(tokens, "resolved-text");
    expect(worst(text, under)).toBeGreaterThanOrEqual(TEXT);
    expect(worst(text, softOver(tokens, "resolved-soft", under))).toBeGreaterThanOrEqual(TEXT);
  });

  it("numbers resolved pins at 4.5:1", () => {
    expect(
      contrast(color(tokens, "resolved-pin"), color(tokens, "on-resolved-pin")),
    ).toBeGreaterThanOrEqual(TEXT);
  });

  it("edges resolved pins at 3:1 on their white halo and on their Mint fill", () => {
    // Mint is about as light as the halo, so this line is what draws the pin's edge.
    const line = color(tokens, "resolved-pin-line");
    expect(contrast(color(tokens, "resolved-pin"), color(tokens, "pin-halo"))).toBeLessThan(MARK);
    expect(contrast(line, color(tokens, "pin-halo"))).toBeGreaterThanOrEqual(MARK);
    expect(contrast(line, color(tokens, "resolved-pin"))).toBeGreaterThanOrEqual(MARK);
  });
});

describe("the brand's status colors", () => {
  it("fills open comments with Coral Red in both themes", () => {
    expect(LIGHT.get("comments")).toBe(CORAL_RED.toLowerCase());
    expect(DARK.get("comments")).toBe(CORAL_RED.toLowerCase());
  });

  it("marks resolved in Forest Green on light and Mint Green on dark", () => {
    expect(LIGHT.get("resolved")).toBe(FOREST_GREEN.toLowerCase());
    expect(LIGHT.get("resolved-text")).toBe(FOREST_GREEN.toLowerCase());
    expect(LIGHT.get("resolved-soft")).toBe(MINT_GREEN.toLowerCase());
    expect(DARK.get("resolved")).toBe(MINT_GREEN.toLowerCase());
    expect(DARK.get("resolved-text")).toBe(MINT_GREEN.toLowerCase());
    expect(DARK.get("resolved-soft")).toBe(FOREST_GREEN.toLowerCase());
  });

  it("fills resolved pins with Mint, and numbers and edges them in Forest, in both themes", () => {
    for (const tokens of [LIGHT, DARK]) {
      expect(tokens.get("resolved-pin")).toBe(MINT_GREEN.toLowerCase());
      expect(tokens.get("on-resolved-pin")).toBe(FOREST_GREEN.toLowerCase());
      expect(tokens.get("resolved-pin-line")).toBe(FOREST_GREEN.toLowerCase());
    }
  });
});

describe("light mock-ups in dark illustrations", () => {
  it("draw status colors as the light theme does", () => {
    for (const name of [
      "comments",
      "comments-soft",
      "comments-text",
      "resolved",
      "resolved-soft",
      "resolved-text",
    ]) {
      expect(MOCK.get(name), name).toBe(LIGHT.get(name));
    }
  });

  it("read red and resolved text at 4.5:1 on their dimmer card and tile", () => {
    const under = surfaces(MOCK, ["card", "tile"]);
    expect(worst(color(MOCK, "comments-text"), under)).toBeGreaterThanOrEqual(TEXT);
    expect(
      contrast(color(MOCK, "comments-text"), color(MOCK, "comments-soft", color(MOCK, "card"))),
    ).toBeGreaterThanOrEqual(TEXT);
    expect(worst(color(MOCK, "resolved-text"), under)).toBeGreaterThanOrEqual(TEXT);
  });
});
