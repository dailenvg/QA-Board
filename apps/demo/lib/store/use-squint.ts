import { useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, subscribe, type StoreState } from "./store";

/** The signed-in workspace. Renders `loading` on the server and during hydration. */
export function useSquint(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
