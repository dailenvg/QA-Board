import { COBALT, NAVY, PAPER, type PaletteEntry } from "@/lib/brand-palette";
import { mix } from "@/lib/color";
import { hashString, rng, type ArtRecipe } from "./art";

/**
 * Back-panel artwork in the look of Native Pet packaging: one bold product
 * hue over most of the field, packaging white, and cobalt as the line art.
 * White always sits between the hue and the blues, so no blend passes
 * through a muddy grey on the way.
 */
function marble(entry: PaletteEntry, angle: number): ArtRecipe {
  const { hex } = entry;
  return {
    name: `${entry.id}-marble-${angle.toFixed(2)}`,
    style: "marble",
    colors: [
      mix(hex, NAVY, 0.22),
      hex,
      hex,
      mix(hex, PAPER, 0.45),
      PAPER,
      COBALT,
      PAPER,
      mix(hex, PAPER, 0.3),
      hex,
    ],
    scale: 0.66,
    warp: 3.2,
    angle,
    gloss: 0.35,
    veins: 0.42,
    veinColor: COBALT,
  };
}

function streak(entry: PaletteEntry, angle: number): ArtRecipe {
  const { hex } = entry;
  return {
    name: `${entry.id}-streak-${angle.toFixed(2)}`,
    style: "streak",
    colors: [
      mix(hex, NAVY, 0.18),
      hex,
      hex,
      mix(hex, PAPER, 0.4),
      PAPER,
      COBALT,
      PAPER,
      hex,
      hex,
      hex,
    ],
    scale: 0.7,
    warp: 1.5,
    angle,
    gloss: 0.22,
    veins: 0,
  };
}

/** Seeds stay small so cache keys stay short; 997 arrangements per recipe is plenty. */
const SEEDS = 997;

export interface FolderArt {
  /** The folder's one brand color, shared by its art and its mascot. */
  swatch: PaletteEntry;
  recipe: ArtRecipe;
  seed: number;
}

/** One recipe object per folder and color, so the art canvas doesn't redraw on every render. */
const artCache = new Map<string, FolderArt>();

/**
 * The folder's grid cell picks its color (`paletteForCell`), so neighbours
 * never match; its id picks the style, flow and arrangement, which stay the
 * same for life.
 */
export function folderArt(folderId: string, swatch: PaletteEntry): FolderArt {
  const key = `${folderId}|${swatch.id}`;
  const cached = artCache.get(key);
  if (cached) return cached;
  const hash = hashString(folderId);
  const random = rng(hash >>> 4);
  const angle = (random() - 0.5) * Math.PI * 1.4;
  const recipe = random() < 0.62 ? marble(swatch, angle) : streak(swatch, angle);
  const art = { swatch, recipe, seed: (hash >>> 8) % SEEDS };
  artCache.set(key, art);
  return art;
}
