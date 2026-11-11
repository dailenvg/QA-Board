import { createContext, useContext, useSyncExternalStore } from "react";
import type { StorageSummary } from "../workspace/types";
import { getWorkspaceStorage, subscribeWorkspace } from "./workspace-store";

/**
 * The workspace's storage use as the server rendered it (`WorkspaceData.storage`),
 * for the server render, hydration and until this tab connects. Null outside
 * `WorkspaceProvider`.
 */
export const StorageStartContext = createContext<StorageSummary | null>(null);

/** The workspace's storage use, as fresh as the rest of the workspace; null when unknown. */
export function useWorkspaceStorage(): StorageSummary | null {
  const initial = useContext(StorageStartContext);
  return useSyncExternalStore(
    subscribeWorkspace,
    () => getWorkspaceStorage() ?? initial,
    () => initial,
  );
}
