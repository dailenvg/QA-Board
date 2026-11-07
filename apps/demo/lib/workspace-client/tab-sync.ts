/**
 * Tells this browser's other tabs of a workspace that it changed, so they
 * read it again. Only a nudge: the server holds the data. Without
 * BroadcastChannel, tabs still catch up when they regain focus.
 */
export interface TabSync {
  announce(): void;
  close(): void;
}

const MESSAGE = "changed";

export function openTabSync(workspaceId: string, onChange: () => void): TabSync {
  if (typeof BroadcastChannel === "undefined") return { announce: () => {}, close: () => {} };
  const channel = new BroadcastChannel(`squint:workspace:${workspaceId}`);
  channel.onmessage = (event: MessageEvent) => {
    if (event.data === MESSAGE) onChange();
  };
  return {
    announce: () => channel.postMessage(MESSAGE),
    close: () => channel.close(),
  };
}
