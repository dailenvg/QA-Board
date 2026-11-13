import type { Queryable } from "../../share/migrate";
import { clickUpApiUrl } from "./config";
import { loadClickUpConnection, type ClickUpConnection } from "./connections";

/** What the settings page's ClickUp row shows. */
export type ClickUpSection =
  | { kind: "connected"; connection: ClickUpConnection }
  | { kind: "disconnected" }
  /** ClickUp can't be reached from this site (`clickUpApiUrl`). */
  | { kind: "unavailable" };

/**
 * A workspace's ClickUp row: its connection, which shows even if the site
 * can no longer reach ClickUp (so the owner can still disconnect it), else
 * whether it can connect.
 */
export async function loadClickUpSection(
  db: Queryable,
  workspaceId: string,
  apiUrl: string | null = clickUpApiUrl(),
): Promise<ClickUpSection> {
  const connection = await loadClickUpConnection(db, workspaceId);
  if (connection) return { kind: "connected", connection };
  return apiUrl ? { kind: "disconnected" } : { kind: "unavailable" };
}
