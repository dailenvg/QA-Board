import { hexToRgb, mix } from "@/lib/color";
import {
  COBALT,
  COMMENTER_PALETTE,
  NAVY,
  PAPER,
  paletteEntry,
  RESOLVED_GREEN,
  type PaletteEntry,
} from "@/lib/brand-palette";

/** A commenter color by palette id, with the number ink the app gives it. */
function commenter(id: string): PaletteEntry {
  const entry = COMMENTER_PALETTE.find((color) => color.id === id);
  if (!entry) throw new Error(`"${id}" is not a commenter color.`);
  return entry;
}

/** A brand color at an opacity, for gradients and shadows. */
function alpha(hex: string, opacity: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** Link preview colors, all drawn from the brand palette. */
export const PREVIEW_COLORS = {
  /** The page behind the panel: paper with a cobalt tint. */
  canvas: mix(COBALT, PAPER, 0.9),
  glow: alpha(COBALT, 0.22),
  /**
   * Where the glow ends: cobalt at zero opacity, not `transparent`. The SVG
   * renderer reads `transparent` as clear black and fades through grey.
   */
  glowFade: alpha(COBALT, 0),
  panel: PAPER,
  ink: NAVY,
  /** 5.4:1 on the panel (AA for body text). */
  muted: mix(NAVY, PAPER, 0.3),
  /** The Daily's lime: the highlighter swash under dark ink, as in the app (navy on it is 11.9:1). */
  highlight: paletteEntry("daily").hex,
  shadow: alpha(NAVY, 0.28),
  pinShadow: alpha(NAVY, 0.35),
} as const;

/**
 * Pin sizes, shared by both cards so they read as one family: a lead pin and
 * two smaller ones. The smallest still sets its number at about 29px, which
 * stays legible when Slack shows the card about 360px wide.
 */
export const PREVIEW_PIN_SIZES = { lead: 88, mid: 72, small: 64 } as const;

/** Pins echoing a review: three commenters and one resolved. */
export const PREVIEW_PINS = {
  pink: commenter("skin-coat"),
  orange: commenter("pumpkin"),
  cyan: commenter("yak-chew"),
  resolved: RESOLVED_GREEN,
} as const;
