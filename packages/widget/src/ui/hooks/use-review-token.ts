import { useEffect, useSyncExternalStore } from "react";
import { captureToken, clearStoredToken } from "../../core/token";

let currentToken: string | null = null;
const listeners = new Set<() => void>();

function emit(next: string | null): void {
  if (next === currentToken) return;
  currentToken = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Shared token state so every caller sees a 401-triggered clear at once. */
export const reviewTokenStore = {
  capture: (): void => emit(captureToken()),
  clear: (): void => {
    clearStoredToken();
    emit(null);
  },
  get: (): string | null => currentToken,
};

/**
 * The review token for this tab, captured from `?review=` on mount.
 * Always null during server rendering.
 */
export function useReviewToken(): string | null {
  const token = useSyncExternalStore(subscribe, reviewTokenStore.get, () => null);
  useEffect(() => {
    reviewTokenStore.capture();
  }, []);
  return token;
}
