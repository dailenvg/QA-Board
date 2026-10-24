import { useEffect } from "react";
import { PULL_INTERVAL_MS } from "./use-share-sync";
import { clientApi } from "./api";
import type { ClientStore } from "./client-store";

/** Keeps a shared link current: every 15 seconds while visible, and on focus. */
export function useClientRefresh(token: string, store: ClientStore): void {
  useEffect(() => {
    const api = clientApi(token);
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const result = await api.view();
      if (result.ok) store.setView(result.value);
      else if (result.status === 404) store.markGone();
    };
    const timer = setInterval(() => void refresh(), PULL_INTERVAL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [token, store]);
}
