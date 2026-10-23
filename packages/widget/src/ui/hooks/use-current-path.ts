import { useSyncExternalStore } from "react";
import { normalizePagePath } from "../../core/url";
import { subscribeToLayout } from "./use-layout-signature";

function getPath(): string {
  return normalizePagePath(window.location.pathname);
}

/**
 * Current page path. Client-side navigations are detected through popstate
 * and the DOM mutations that accompany a route change. Pass `override` to
 * control it explicitly (e.g. from a router hook).
 */
export function useCurrentPath(override?: string): string {
  const detected = useSyncExternalStore(subscribeToLayout, getPath, () => "/");
  return override === undefined ? detected : normalizePagePath(override);
}
