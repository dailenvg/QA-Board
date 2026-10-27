import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMMENTER_PALETTE,
  commenterColor,
  FOLDER_COLOR_COUNT,
  folderColor,
  folderSwatches,
  MIN_NUMBER_CONTRAST,
  NATIVE_PET_PALETTE,
  NAVY,
  PAPER,
  RESOLVED_GREEN,
} from "./brand-palette";
import { contrast } from "./color";
import type { Folder } from "./store/types";

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

describe("folderColor", () => {
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
  /** Two full turns of the palette, so the wrap from last to first is checked too. */
  const sequence = Array.from(
    { length: FOLDER_COLOR_COUNT * 2 },
    (_, rank) => folderColor(rank).id,
  );

  it("never gives a folder The Daily's lime, the app's highlight", () => {
    const used = new Set(sequence);
    expect(used.has("daily")).toBe(false);
    expect(used.size).toBe(FOLDER_COLOR_COUNT);
    expect(NATIVE_PET_PALETTE.length - 1).toBe(FOLDER_COLOR_COUNT);
  });

  it("repeats no color until every color is used, then starts over", () => {
    const first = sequence.slice(0, FOLDER_COLOR_COUNT);
    expect(new Set(first).size).toBe(FOLDER_COLOR_COUNT);
    expect(sequence.slice(FOLDER_COLOR_COUNT)).toEqual(first);
  });

  it("alternates warm and cool, and keeps colors of a kind apart, one after the other", () => {
    for (let rank = 0; rank + 1 < sequence.length; rank += 1) {
      const [a, b] = [sequence[rank] as string, sequence[rank + 1] as string];
      expect(WARM.has(a)).not.toBe(WARM.has(b));
      for (const kind of KINDS) expect(kind.includes(a) && kind.includes(b)).toBe(false);
    }
  });

  it("treats a negative or fractional rank as the nearest one it can", () => {
    expect(folderColor(-3)).toBe(folderColor(0));
    expect(folderColor(2.7)).toBe(folderColor(2));
  });
});

describe("folderSwatches", () => {
  const folder = (id: string, createdAt: number, parentId: string | null = null): Folder => ({
    id,
    name: id,
    createdAt,
    parentId,
  });
  const folders = [
    folder("c", 30),
    folder("a", 10),
    folder("sub-2", 25, "a"),
    folder("b", 20),
    folder("sub-1", 15, "a"),
  ];

  it("colors each folder by its place in creation order among its siblings", () => {
    const swatches = folderSwatches(folders);
    expect(swatches.get("a")).toBe(folderColor(0));
    expect(swatches.get("b")).toBe(folderColor(1));
    expect(swatches.get("c")).toBe(folderColor(2));
    // Subfolders count among themselves, from the first color.
    expect(swatches.get("sub-1")).toBe(folderColor(0));
    expect(swatches.get("sub-2")).toBe(folderColor(1));
  });

  it("gives the same colors whatever order the folders come in (a sort never recolors)", () => {
    const ids = (map: ReturnType<typeof folderSwatches>) =>
      Object.fromEntries([...map].map(([id, entry]) => [id, entry.id]));
    const expected = ids(folderSwatches(folders));
    expect(ids(folderSwatches([...folders].reverse()))).toEqual(expected);
    expect(ids(folderSwatches([...folders].sort((x, y) => x.id.localeCompare(y.id))))).toEqual(
      expected,
    );
  });

  it("breaks a tie in creation time by id", () => {
    const swatches = folderSwatches([folder("y", 5), folder("x", 5)]);
    expect(swatches.get("x")).toBe(folderColor(0));
    expect(swatches.get("y")).toBe(folderColor(1));
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
