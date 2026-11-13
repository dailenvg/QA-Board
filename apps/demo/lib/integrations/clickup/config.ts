import { isLocalHttp } from "../../auth/session-cookie";

/**
 * Where Squint reaches ClickUp's API. No setup: a workspace's owner connects
 * with their own personal token. The only knob is a test stub's URL.
 */

/** Reads CLICKUP_API_URL, VERCEL_ENV and AUTH_SECRET. */
export type ClickUpEnv = Readonly<Record<string, string | undefined>>;

/** ClickUp's API, up to and including `/v2`. */
const API_URL = "https://api.clickup.com/api/v2";

/**
 * ClickUp's API URL, or null when the integration can't work here. Without
 * `AUTH_SECRET` a token can't be sealed. `CLICKUP_API_URL` points it at a
 * test stub (the e2e suite's): only plain http on this machine, and never on
 * production, so a stray value can't send a token anywhere; any other value
 * turns the integration off rather than guess.
 */
export function clickUpApiUrl(env: ClickUpEnv = process.env): string | null {
  if (!env.AUTH_SECRET?.trim()) return null;
  const override = env.CLICKUP_API_URL?.trim();
  if (!override) return API_URL;
  if (env.VERCEL_ENV === "production") return null;
  try {
    return isLocalHttp(new URL(override)) ? override.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}
