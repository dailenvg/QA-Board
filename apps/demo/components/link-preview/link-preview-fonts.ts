import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Figtree for the generated cards, bundled under assets/fonts (SIL OFL, see
 * Figtree-OFL.txt). ImageResponse reads TTF, OTF or WOFF, not WOFF2, so these
 * are the static TTF instances Google Fonts serves.
 */
const FONT_DIR = join(process.cwd(), "assets", "fonts");

const FACES = [
  { file: "Figtree-SemiBold.ttf", weight: 600 },
  { file: "Figtree-ExtraBold.ttf", weight: 800 },
] as const;

export async function linkPreviewFonts() {
  return Promise.all(
    FACES.map(async ({ file, weight }) => ({
      name: "Figtree",
      data: await readFile(join(FONT_DIR, file)),
      weight,
      style: "normal" as const,
    })),
  );
}
