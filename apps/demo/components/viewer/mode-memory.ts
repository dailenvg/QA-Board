import type { ViewerMode } from "./types";

const PREFIX = "squint:viewer-mode:";

/** This visit's choices, so they still apply where storage is refused. */
const kept = new Map<string, ViewerMode>();

function isMode(value: unknown): value is ViewerMode {
  return value === "browse" || value === "comment";
}

function stored(scope: string): ViewerMode | null {
  try {
    const value = localStorage.getItem(PREFIX + scope);
    return isMode(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The mode last picked in `scope` (a project, or a shared link) in this
 * browser, apart from the workspace data; null when none was.
 */
export function rememberedMode(scope: string): ViewerMode | null {
  return kept.get(scope) ?? stored(scope);
}

/** Remembers a mode the person picked, for the next time `scope` opens. */
export function rememberMode(scope: string, mode: ViewerMode): void {
  kept.set(scope, mode);
  try {
    localStorage.setItem(PREFIX + scope, mode);
  } catch {
    // Not remembered past this visit; the mode still applies now.
  }
}
