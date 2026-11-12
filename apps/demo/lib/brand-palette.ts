/**
 * Native Pet's packaging palette: each product's band or lid color, plus the
 * brand neutrals. Sampled from product photography (flat, unlit areas of the
 * print where there was one). Folder art and folder mascots both read from
 * here, so a folder's color is defined once.
 */

import { contrast } from "./color";
import type { Folder } from "./store/types";

export interface PaletteEntry {
  id: string;
  /** The product the color comes from. */
  name: string;
  hex: string;
  /** True when navy reads better than white on it; `ink` follows. */
  light: boolean;
  /** Eyes, strokes and other marks drawn on this color: navy or white. */
  ink: string;
}

/** The wordmark and line-art cobalt. */
export const COBALT = "#1157CE";
/** Deep navy, from the measuring scoop: the darkest ink in the system. */
export const NAVY = "#012D61";
/** Packaging white. */
export const PAPER = "#FDFDFD";

/** Squint's Coral Red: open comments (`--comments` in globals.css). */
export const CORAL_RED = "#FF3C41";
/** Squint's Mint Green: resolved pins and badges in light, resolved marks in dark. */
export const MINT_GREEN = "#C8FFC8";
/** Squint's Forest Green: resolved marks and text in light, the numbers on resolved pins. */
export const FOREST_GREEN = "#004132";

/** Marks on a color keep at least this contrast in white, or switch to navy (WCAG 1.4.11). */
const MIN_MARK_CONTRAST = 3;

const PRODUCTS: ReadonlyArray<Pick<PaletteEntry, "id" | "name" | "hex">> = [
  { id: "daily", name: "The Daily", hex: "#E1FD73" },
  { id: "hip-joint", name: "Hip+Joint", hex: "#E03B9D" },
  { id: "omega-oil", name: "Omega Oil", hex: "#EB5239" },
  { id: "allergy", name: "Allergy", hex: "#16AF74" },
  { id: "pumpkin", name: "Pumpkin", hex: "#FEB651" },
  { id: "clean-breath", name: "Clean Breath", hex: "#99E7D8" },
  { id: "probiotic", name: "Probiotic", hex: "#49C1F4" },
  { id: "sockeye", name: "Sockeye Salmon", hex: "#E4506B" },
  { id: "skin-coat", name: "Skin+Coat", hex: "#E47DAC" },
  { id: "goat-milk", name: "Goat Milk", hex: "#CB9DD7" },
  { id: "colostrum", name: "Colostrum", hex: "#38B1A4" },
  { id: "yak-chew", name: "Yak Chew", hex: "#44DBE5" },
  { id: "bladder", name: "Bladder", hex: "#E33B47" },
  { id: "calm", name: "Calm", hex: "#6D88EB" },
  { id: "bone-broth", name: "Bone Broth", hex: "#CFAE6F" },
];

/** Every product color, each with the ink that reads on it. */
export const NATIVE_PET_PALETTE: readonly PaletteEntry[] = PRODUCTS.map((product) => {
  const light = contrast(product.hex, PAPER) < MIN_MARK_CONTRAST;
  return { ...product, light, ink: light ? NAVY : PAPER };
});

/** A palette color by its product id. */
export function paletteEntry(id: string): PaletteEntry {
  const entry = NATIVE_PET_PALETTE.find((product) => product.id === id);
  if (!entry) throw new Error(`No palette entry "${id}".`);
  return entry;
}

/**
 * Resolved's Mint Green: resolved pins, badges and the Resolved mascot (`--resolved-pin` in
 * globals.css, kept equal by a test), with Forest Green numbers, checks and eyes at 10.3:1. Not
 * a product color. Folders still wear the Allergy green.
 */
export const RESOLVED_GREEN: PaletteEntry = {
  id: "resolved",
  name: "Resolved",
  hex: MINT_GREEN,
  light: true,
  ink: FOREST_GREEN,
};

/**
 * The folder palette in the order folders are given it, without The Daily: its
 * lime is the app's highlight (selection, type tags), so folders don't wear
 * it. Seven warm and seven cool colors alternate, also across the wrap from
 * the last back to the first, and the reds (Omega Oil, Sockeye Salmon,
 * Bladder), greens (Allergy, Clean Breath, Colostrum), pinks and blues are
 * placed so that no two of a kind come one after the other.
 */
const FOLDER_ORDER = [
  "calm",
  "skin-coat",
  "probiotic",
  "bone-broth",
  "clean-breath",
  "omega-oil",
  "goat-milk",
  "hip-joint",
  "yak-chew",
  "pumpkin",
  "colostrum",
  "bladder",
  "allergy",
  "sockeye",
].map(paletteEntry);

/** How many colors folders take turns with. */
export const FOLDER_COLOR_COUNT = FOLDER_ORDER.length;

/**
 * The color of the folder `rank`th in creation order among its siblings (0 for
 * the oldest). It follows the folder, not its place on screen, so sorting or a
 * new column count never recolors it. Consecutive folders get consecutive
 * colors, and no color repeats until all of them have been used.
 */
export function folderColor(rank: number): PaletteEntry {
  const index = Math.max(0, Math.floor(rank)) % FOLDER_ORDER.length;
  const entry = FOLDER_ORDER[index];
  if (!entry) throw new Error("The brand palette is empty.");
  return entry;
}

/** Oldest first; folders made in the same millisecond go by id, so input order never matters. */
function byCreation(a: Folder, b: Folder): number {
  return a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Every folder's color, by id: its place in creation order among its siblings
 * (the top-level folders, or one folder's subfolders), through folderColor. The
 * Overview's sort, the grid's column count and the viewport never change it, so
 * a folder's art and mascot keep their color wherever it shows. Deleting an
 * older sibling, or moving the folder to another parent, does move it along.
 */
export function folderSwatches(folders: readonly Folder[]): Map<string, PaletteEntry> {
  const swatches = new Map<string, PaletteEntry>();
  const nextRank = new Map<string | null, number>();
  for (const folder of [...folders].sort(byCreation)) {
    const rank = nextRank.get(folder.parentId) ?? 0;
    nextRank.set(folder.parentId, rank + 1);
    swatches.set(folder.id, folderColor(rank));
  }
  return swatches;
}

/**
 * Green means resolved on pins and badges, so no commenter is given a green:
 * the palette's greens by id, and resolved's own Mint and Forest by hex.
 */
export const RESOLVED_GREENS: ReadonlySet<string> = new Set([
  "allergy",
  "colostrum",
  "clean-breath",
  MINT_GREEN,
  FOREST_GREEN,
]);

/**
 * Left out of the commenter set (by palette id or hex) for clashing with UI
 * state: The Daily's lime is the selection ring around a selected pin.
 */
export const COMMENTER_EXCLUDED: ReadonlySet<string> = new Set(["daily", ...RESOLVED_GREENS]);

/** Pin and badge numbers are 12px bold, not large text, so they need 4.5:1 (WCAG 1.4.3). */
export const MIN_NUMBER_CONTRAST = 4.5;

/** A commenter's color: `ink` is the number color (navy or paper), `contrast` its ratio. */
export interface CommenterColor extends PaletteEntry {
  contrast: number;
}

/** Navy or paper, whichever reads better on `hex`, with its contrast ratio. */
export function readableInk(hex: string): { ink: string; contrast: number } {
  const onNavy = contrast(hex, NAVY);
  const onPaper = contrast(hex, PAPER);
  return onNavy >= onPaper ? { ink: NAVY, contrast: onNavy } : { ink: PAPER, contrast: onPaper };
}

/**
 * The colors commenters are given: the palette without greens and The Daily,
 * and without any color where neither navy nor paper numbers reach 4.5:1.
 * The palette's hexes stay as they are; a color that can't carry a readable
 * number is simply not used for pins.
 */
export const COMMENTER_PALETTE: readonly CommenterColor[] = NATIVE_PET_PALETTE.flatMap(
  (entry): CommenterColor[] => {
    if (COMMENTER_EXCLUDED.has(entry.id) || COMMENTER_EXCLUDED.has(entry.hex)) return [];
    const { ink, contrast: ratio } = readableInk(entry.hex);
    if (ratio < MIN_NUMBER_CONTRAST) return [];
    return [{ ...entry, light: ink === NAVY, ink, contrast: ratio }];
  },
);

/** FNV-1a: a small, stable string hash (the same in every browser and on every visit). */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/**
 * A commenter's pin color, from their name: the same person keeps the same
 * color across projects, shared links and reloads. Case and spacing don't
 * matter. Picked from COMMENTER_PALETTE, so its `ink` is the number color.
 */
export function commenterColor(author: string): CommenterColor {
  const key = author.trim().replace(/\s+/g, " ").toLowerCase();
  const entry = COMMENTER_PALETTE[hash(key) % COMMENTER_PALETTE.length];
  if (!entry) throw new Error("The commenter palette is empty.");
  return entry;
}

/**
 * The light theme's surfaces a company's brand color is drawn on or beside on
 * its shared links: cards (white) and panels (`--card` and `--panel`). The
 * dark theme lifts the color until it reads (`components/share/brand-accent.ts`).
 */
export const BRAND_SURFACES = [
  { id: "white", label: "White", hex: "#ffffff" },
  { id: "panel", label: "Light gray", hex: "#f4f4f5" },
] as const;

/** A brand color is a mark (a rule, a ring, a monogram tile): 3:1 on each surface (WCAG 1.4.11). */
export const MIN_BRAND_CONTRAST = MIN_MARK_CONTRAST;

export interface SurfaceContrast {
  id: (typeof BRAND_SURFACES)[number]["id"];
  label: string;
  ratio: number;
  passes: boolean;
}

/** How `hex` stands out on each of BRAND_SURFACES, and whether that's enough. */
export function brandColorContrast(hex: string): SurfaceContrast[] {
  return BRAND_SURFACES.map(({ id, label, hex: surface }) => {
    const ratio = contrast(hex, surface);
    return { id, label, ratio, passes: ratio >= MIN_BRAND_CONTRAST };
  });
}
