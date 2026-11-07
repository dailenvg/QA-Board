import { useContext, useSyncExternalStore } from "react";
import { WorkspaceStartContext } from "../workspace-client/use-workspace-data";
import { getServerSnapshot, getSnapshot, subscribe, type StoreState } from "./store";

/**
 * The signed-in workspace. Inside `WorkspaceProvider`, the server's render of
 * it on the server, in hydration and until this tab connects, so pages never
 * wait on a skeleton the server already had the data for; elsewhere, loading
 * until connected.
 */
export function useSquint(): StoreState {
  const initial = useContext(WorkspaceStartContext);
  return useSyncExternalStore(
    subscribe,
    () => {
      const state = getSnapshot();
      return state.status === "loading" && initial ? initial : state;
    },
    () => initial ?? getServerSnapshot(),
  );
}
