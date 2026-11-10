import type { CSSProperties } from "react";
import { contrast, mix } from "@/lib/color";

/** The dark theme's `--card`: the lightest surface the rule and ring sit on or beside there. */
const DARK_SURFACE = "#27272c";
/** WCAG 1.4.11's non-text ratio. The accent is decorative, but this keeps it visible. */
const MIN_ACCENT_CONTRAST = 3;
/** How finely the color is lifted toward white: 5% at a time. */
const LIFT_STEPS = 20;

/**
 * A company color for the dark theme: lifted toward white just until it reads
 * on dark surfaces (3:1), so a navy or black brand still shows. Colors that
 * already read come back unchanged.
 */
export function darkAccent(color: string): string {
  for (let step = 0; step < LIFT_STEPS; step += 1) {
    const lifted = mix(color, "#FFFFFF", step / LIFT_STEPS);
    if (contrast(lifted, DARK_SURFACE) >= MIN_ACCENT_CONTRAST) return lifted;
  }
  return "#FFFFFF";
}

/**
 * Sets `--guest-accent` and `--guest-accent-dark` (Tailwind's `guest-accent`
 * and `guest-accent-dark`) to a shared link's company color for everything
 * inside; nothing when it has none, so the app's own brand color stands in.
 * Use both, as `x-guest-accent dark:x-guest-accent-dark`. Portaled content
 * (dialogs) sets them again.
 */
export function accentStyle(color: string | null): CSSProperties | undefined {
  return color
    ? ({ "--guest-accent": color, "--guest-accent-dark": darkAccent(color) } as CSSProperties)
    : undefined;
}
