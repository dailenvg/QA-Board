import { useSyncExternalStore } from "react";
import { readTheme, subscribeTheme, type Theme } from "./theme";

const serverTheme = (): Theme => "light";

/** The app theme from `data-theme` on <html>, live across toggles and tabs. Light on the server. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, readTheme, serverTheme);
}
