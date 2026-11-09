import { createContext, useContext, useSyncExternalStore } from "react";
import type { ClientCommentActivity } from "../workspace/types";
import { getClientActivity, subscribeWorkspace } from "./workspace-store";

const NONE: readonly ClientCommentActivity[] = [];

/**
 * Clients' comments as the server rendered them (`WorkspaceData.clientActivity`),
 * for the server render, hydration and until this tab connects.
 */
export const ClientActivityStartContext = createContext<readonly ClientCommentActivity[]>(NONE);

/** Clients' comments per project, kept as fresh as the rest of the workspace. */
export function useClientActivity(): readonly ClientCommentActivity[] {
  const initial = useContext(ClientActivityStartContext);
  return useSyncExternalStore(
    subscribeWorkspace,
    () => getClientActivity() ?? initial,
    () => initial,
  );
}
