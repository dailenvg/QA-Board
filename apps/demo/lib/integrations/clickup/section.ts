import type { Queryable } from "../../share/migrate";
import { clickUpApiUrl } from "./config";
import { loadClickUpConnection, type ClickUpActor, type ClickUpConnection } from "./connections";

/** What the profile's ClickUp card shows. */
export type ClickUpSection =
  | { kind: "connected"; connection: ClickUpConnection }
  | { kind: "disconnected" }
  /** ClickUp is switched off on this site (`clickUpApiUrl` is null). */
  | { kind: "unavailable" };

/**
 * A member's ClickUp card: their connection, which shows even if the site
 * can no longer reach ClickUp (so they can still disconnect it), else
 * whether they can connect.
 */
export async function loadClickUpSection(
  db: Queryable,
  actor: ClickUpActor,
  apiUrl: string | null = clickUpApiUrl(),
): Promise<ClickUpSection> {
  const connection = await loadClickUpConnection(db, actor);
  if (connection) return { kind: "connected", connection };
  return apiUrl ? { kind: "disconnected" } : { kind: "unavailable" };
}
