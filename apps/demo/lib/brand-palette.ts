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

/**
 * The palette in grid order: neighbours alternate warm and cool, and the three
 * reds (Omega Oil, Sockeye Salmon, Bladder) sit five apart.
 */
const GRID_ORDER = [
  "daily",
  "calm",
  "omega-oil",
  "clean-breath",
  "hip-joint",
  "pumpkin",
  "probiotic",
  "sockeye",
  "allergy",
  "goat-milk",
  "bone-broth",
  "yak-chew",
  "bladder",
  "skin-coat",
  "colostrum",
].map((id) => {
  const entry = NATIVE_PET_PALETTE.find((product) => product.id === id);
  if (!entry) throw new Error(`No palette entry "${id}".`);
  return entry;
});

/**
 * Each row steps this far through GRID_ORDER. It shares no factor with the
 * palette's length, so one column only repeats a color after every color has
 * been used.
 */
const ROW_STEP = 7;

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
