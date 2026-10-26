"use client";

import type { PaletteEntry } from "@/lib/brand-palette";
import { Squiggy } from "../brand/mascot/Squiggy";

/**
 * In the folder's own units: the mascot is the key itself, standing on the
 * glass at the bottom right (about 68px wide at the 250px card cap).
 */
const SIZE = 104;

interface FolderMascotProps {
  /** The folder's brand color: the body, with eyes and strokes in its ink. */
  swatch: PaletteEntry;
  /** While the folder is hovered or focused it perks up and looks around through the lens. */
  active: boolean;
}

/** Squiggy holding a magnifying glass: "look inside this folder". Decorative. */
export function FolderMascot({ swatch, active }: FolderMascotProps) {
  return (
    <Squiggy
      mood={active ? "searching" : "idle"}
      accessory="magnifier"
      perked={active}
      followCursor={false}
      size={SIZE}
      color={swatch.hex}
      eyeColor={swatch.ink}
      ink={swatch.ink}
    />
  );
}
