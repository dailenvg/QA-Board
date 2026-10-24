import { useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, subscribe, type StoreState } from "./store";

/** Squint data from localStorage. Renders `loading` on the server and during hydration. */
export function useSquint(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
