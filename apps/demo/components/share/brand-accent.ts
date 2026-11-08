import type { CSSProperties } from "react";

/**
 * Sets `--guest-accent` (Tailwind's `guest-accent`) to a shared link's company
 * color for everything inside; nothing when it has none, so the app's own
 * brand color stands in. Portaled content (dialogs) sets it again.
 */
export function accentStyle(color: string | null): CSSProperties | undefined {
  return color ? ({ "--guest-accent": color } as CSSProperties) : undefined;
}
