/**
 * Native Pet's packaging palette: each product's band or lid color, plus the
 * brand neutrals. Sampled from product photography (flat, unlit areas of the
 * print where there was one). Folder art and folder mascots both read from
 * here, so a folder's color is defined once.
 */

import { contrast } from "./color";

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

/** Allergy green: resolved pins, badges and the Resolved mascot. */
export const RESOLVED_GREEN = paletteEntry("allergy");

/**
 * The palette in grid order, without The Daily: its lime is the app's
 * highlight (selection, type tags), so folders don't wear it. Seven warm and
 * seven cool colors alternate, and with an odd ROW_STEP they alternate down
 * each column too. The reds (Omega Oil, Sockeye Salmon, Bladder), greens
 * (Allergy, Clean Breath, Colostrum), pinks and blues are placed so that no
 * two of a kind sit side by side or stacked, at any column count up to five.
 */
const GRID_ORDER = [
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

/**
 * Each row steps this far through GRID_ORDER. It shares no factor with the
 * palette's length (14), so one column only repeats a color after every color
 * has been used.
 */
const ROW_STEP = 3;

/**
 * The color for a grid cell. Within a row the colors are consecutive, and down
 * a column each row moves ROW_STEP along, so no row or column repeats a color
 * until it holds more cells than the palette has colors.
 */
export function paletteForCell(index: number, columns: number): PaletteEntry {
  const cols = Math.max(1, columns);
  const row = Math.floor(index / cols);
  const col = index % cols;
  const entry = GRID_ORDER[(col + row * ROW_STEP) % GRID_ORDER.length];
  if (!entry) throw new Error("The brand palette is empty.");
  return entry;
}

/** Green means resolved on pins and badges, so no commenter is given a green. */
export const RESOLVED_GREENS: ReadonlySet<string> = new Set([
  "allergy",
  "colostrum",
  "clean-breath",
]);

/**
 * Left out of the commenter set for clashing with UI state: The Daily's lime
 * is the selection ring around a selected pin.
 */
export const COMMENTER_EXCLUDED: ReadonlySet<string> = new Set(["daily", ...RESOLVED_GREENS]);

/** Pin and badge numbers are 12px bold, not large text, so they need 4.5:1 (WCAG 1.4.3). */
export const MIN_NUMBER_CONTRAST = 4.5;

/** A commenter's color: `ink` is the number color (navy or paper), `contrast` its ratio. */
export interface CommenterColor extends PaletteEntry {
  contrast: number;
}

/** Navy or paper, whichever reads better on `hex`, with its contrast ratio. */
function numberInk(hex: string): { ink: string; contrast: number } {
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
    if (COMMENTER_EXCLUDED.has(entry.id)) return [];
    const { ink, contrast: ratio } = numberInk(entry.hex);
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
