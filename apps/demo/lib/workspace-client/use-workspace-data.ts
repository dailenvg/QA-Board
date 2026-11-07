import { useEffect } from "react";
import type { BlobSource } from "../blob-store/blob-source";
import type { WorkspaceStart } from "../workspace/types";
import {
  connectWorkspace,
  refreshWorkspace,
  subscribeNotices,
  workspaceBlobs,
} from "./workspace-store";

/** Focus and visibility changes this close together read the workspace once. */
const REFRESH_GAP_MS = 1_000;

/** The connected workspace's images, whichever workspace that is when they're read. */
const CONNECTED_BLOBS: BlobSource = {
  get: (key) => workspaceBlobs()?.get(key) ?? Promise.resolve(null),
  subscribe: (key, listener) => workspaceBlobs()?.subscribe(key, listener) ?? (() => {}),
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
 * `onNotice` (a toast). Returns where the page reads the workspace's images.
 */
export function useWorkspaceData(
  start: WorkspaceStart,
  onNotice: (message: string) => void,
): BlobSource {
  useEffect(() => connectWorkspace(start), [start]);
  useEffect(() => subscribeNotices(onNotice), [onNotice]);
  useRefreshOnFocus();
  return CONNECTED_BLOBS;
}
