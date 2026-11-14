/**
 * The channel a member last sent to from this browser, per workspace, so
 * Send to ClickUp starts there. A convenience only: storage that's off or
 * full just means no channel is picked ahead.
 */

const key = (workspaceId: string) => `squint:clickup-channel:${workspaceId}`;

export function readLastClickUpChannel(workspaceId: string): string | null {
  try {
    return localStorage.getItem(key(workspaceId));
  } catch {
    return null;
  }
}

/** Forgets the remembered channel when it's this one (gone, or refused by ClickUp). */
export function forgetClickUpChannel(workspaceId: string, channelId: string): void {
  try {
    if (localStorage.getItem(key(workspaceId)) === channelId)
      localStorage.removeItem(key(workspaceId));
  } catch {
    // Storage off: nothing was remembered.
  }
}

export function rememberClickUpChannel(workspaceId: string, channelId: string): void {
  try {
    localStorage.setItem(key(workspaceId), channelId);
  } catch {
    // Private mode or full: next time starts without one.
  }
}
