import { createContext, useEffect } from "react";
import type { BlobSource } from "../blob-store/blob-source";
import type { WorkspaceStart } from "../workspace/types";
import {
  connectedBlobs,
  connectWorkspace,
  refreshWorkspace,
  startState,
  subscribeNotices,
  type WorkspaceState,
} from "./workspace-store";

/**
 * The state the server rendered the page with (`startState`), for `useSquint`
 * to show on the server and in hydration, and until the tab has connected.
 * Null outside `WorkspaceProvider`.
 */
export const WorkspaceStartContext = createContext<WorkspaceState | null>(null);

/** Focus and visibility changes this close together read the workspace once. */
const REFRESH_GAP_MS = 1_000;

/**
 * The connected workspace's images, whichever workspace that is when they're
 * read. Pages render from the server's data before the tab connects (in
 * hydration), so reads and subscriptions made then wait for the connection.
 */
const CONNECTED_BLOBS: BlobSource = {
  get: (key) => connectedBlobs().then((blobs) => blobs.get(key)),
  subscribe: (key, listener) => {
    let stop: (() => void) | null = null;
    let stopped = false;
    void connectedBlobs().then((blobs) => {
      if (!stopped) stop = blobs.subscribe(key, listener);
    });
    return () => {
      stopped = true;
      stop?.();
    };
  },
};

/** Reads the workspace again whenever the tab comes back into view. */
function useRefreshOnFocus(): void {
  useEffect(() => {
    let last = 0;
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < REFRESH_GAP_MS) return;
      last = Date.now();
      void refreshWorkspace();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
}

/**
 * Connects this tab to the workspace the server rendered (`start`), keeps it
 * fresh while the page is open, and passes refusals of background saves to
 * `onNotice` (a toast). Returns where the page reads the workspace's images,
 * and the state to show until the tab has connected.
 */
export function useWorkspaceData(
  start: WorkspaceStart,
  onNotice: (message: string) => void,
): { blobs: BlobSource; initial: WorkspaceState } {
  useEffect(() => connectWorkspace(start), [start]);
  useEffect(() => subscribeNotices(onNotice), [onNotice]);
  useRefreshOnFocus();
  return { blobs: CONNECTED_BLOBS, initial: startState(start) };
}
