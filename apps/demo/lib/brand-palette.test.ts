import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMMENTER_PALETTE,
  commenterColor,
  MIN_NUMBER_CONTRAST,
  NATIVE_PET_PALETTE,
  NAVY,
  PAPER,
  paletteForCell,
  RESOLVED_GREEN,
} from "./brand-palette";
import { contrast } from "./color";

const GREENS = ["allergy", "colostrum", "clean-breath"];

describe("COMMENTER_PALETTE", () => {
  it("numbers every commenter color in navy or paper at 4.5:1 or more", () => {
    for (const color of COMMENTER_PALETTE) {
      expect([NAVY, PAPER]).toContain(color.ink);
      expect(contrast(color.hex, color.ink)).toBeGreaterThanOrEqual(MIN_NUMBER_CONTRAST);
      expect(color.contrast).toBeCloseTo(contrast(color.hex, color.ink));
    }
  });

  it("picks whichever of navy and paper reads better", () => {
    for (const color of COMMENTER_PALETTE) {
      const other = color.ink === NAVY ? PAPER : NAVY;
      expect(contrast(color.hex, color.ink)).toBeGreaterThanOrEqual(contrast(color.hex, other));
    }
  });

  it("leaves out The Daily (the lime selection ring) and the greens", () => {
    const ids = COMMENTER_PALETTE.map((color) => color.id);
    expect(ids).not.toContain("daily");
    for (const green of GREENS) expect(ids).not.toContain(green);
  });

  it("leaves out only colors where neither ink reaches 4.5:1", () => {
    const ids = new Set(COMMENTER_PALETTE.map((color) => color.id));
    for (const entry of NATIVE_PET_PALETTE) {
      if (entry.id === "daily" || GREENS.includes(entry.id) || ids.has(entry.id)) continue;
      const best = Math.max(contrast(entry.hex, NAVY), contrast(entry.hex, PAPER));
      expect(best).toBeLessThan(MIN_NUMBER_CONTRAST);
    }
  });

  it("keeps at least six colors to tell commenters apart", () => {
    expect(COMMENTER_PALETTE.length).toBeGreaterThanOrEqual(6);
  });

  it("keeps the folder palette's hexes and inks untouched", () => {
    const daily = NATIVE_PET_PALETTE.find((entry) => entry.id === "daily");
    expect(daily?.hex).toBe("#E1FD73");
    expect(NATIVE_PET_PALETTE).toHaveLength(15);
  });
});

describe("paletteForCell", () => {
  const WARM = new Set([
    "omega-oil",
    "hip-joint",
    "pumpkin",
    "sockeye",
    "bladder",
    "skin-coat",
    "bone-broth",
  ]);
  /** Colors of a kind that shouldn't touch: two reds side by side read as one block. */
  const KINDS = [
    ["omega-oil", "sockeye", "bladder"],
    ["allergy", "colostrum", "clean-breath"],
    ["hip-joint", "skin-coat", "sockeye"],
    ["probiotic", "yak-chew", "calm"],
  ];
  const FOLDER_COLORS = 14;
  /** A grid of `rows` by `columns` color ids, as FolderGrid lays folders out. */
  const grid = (columns: number, rows = FOLDER_COLORS) =>
    Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, col) => paletteForCell(row * columns + col, columns).id),
    );
  /** Each cell with its right and lower neighbours. */
  const neighbours = (cells: string[][]) =>
    cells.flatMap((row, r) =>
      row.flatMap((id, c) => [
        ...(c + 1 < row.length ? [[id, row[c + 1]]] : []),
        ...(r + 1 < cells.length ? [[id, cells[r + 1]?.[c]]] : []),
      ]),
    ) as [string, string][];

  it("never gives a folder The Daily's lime, the app's highlight", () => {
    const used = new Set(grid(5).flat());
    expect(used.has("daily")).toBe(false);
    expect(used.size).toBe(FOLDER_COLORS);
    expect(NATIVE_PET_PALETTE.length - 1).toBe(FOLDER_COLORS);
  });

  it("repeats no color in a row or column until every color is used", () => {
    for (let columns = 1; columns <= 5; columns += 1) {
      const cells = grid(columns);
      for (const row of cells) expect(new Set(row).size).toBe(row.length);
      for (let col = 0; col < columns; col += 1) {
        expect(new Set(cells.map((row) => row[col])).size).toBe(FOLDER_COLORS);
      }
    }
  });

  it("alternates warm and cool, and keeps colors of a kind apart, across and down", () => {
    for (let columns = 1; columns <= 5; columns += 1) {
      for (const [a, b] of neighbours(grid(columns))) {
        expect(WARM.has(a)).not.toBe(WARM.has(b));
        for (const kind of KINDS) expect(kind.includes(a) && kind.includes(b)).toBe(false);
      }
    }
  });

  it("treats a missing column count as one column", () => {
    expect(paletteForCell(3, 0)).toBe(paletteForCell(3, 1));
  });
});

describe("commenterColor", () => {
  it("gives the same name the same color, whatever its case and spacing", () => {
    const color = commenterColor("Ana Lima");
    expect(commenterColor("Ana Lima")).toBe(color);
    expect(commenterColor("  ana   LIMA ")).toBe(color);
  });

  it("never hands out a green, which is kept for resolved comments", () => {
    const names = Array.from({ length: 500 }, (_, index) => `Reviewer ${index}`);
    const used = new Set(names.map((name) => commenterColor(name).id));
    for (const green of GREENS) expect(used.has(green)).toBe(false);
  });

  it("never hands out The Daily or a color whose number would fall under 4.5:1", () => {
    const names = Array.from({ length: 500 }, (_, index) => `Reviewer ${index}`);
    for (const name of names) {
      const color = commenterColor(name);
      expect(color.id).not.toBe("daily");
      expect(contrast(color.hex, color.ink)).toBeGreaterThanOrEqual(MIN_NUMBER_CONTRAST);
    }
  });

  it("spreads names over every commenter color", () => {
    const names = Array.from({ length: 500 }, (_, index) => `Reviewer ${index}`);
    const used = new Set(names.map((name) => commenterColor(name).id));
    expect(used.size).toBe(COMMENTER_PALETTE.length);
  });
});

describe("resolved pin tokens", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  /** A custom property's value in globals.css, lowercased. */
  const token = (name: string) =>
    new RegExp(`(?<![\\w-])--${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim().toLowerCase();

  it("fills resolved pins with the palette's Allergy green", () => {
    expect(token("resolved-pin")).toBe(RESOLVED_GREEN.hex.toLowerCase());
  });

  it("numbers resolved pins in navy", () => {
    expect(token("on-resolved-pin")).toBe(NAVY.toLowerCase());
  });
});
