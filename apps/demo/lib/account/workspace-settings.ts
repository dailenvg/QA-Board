import type { Database } from "../db/database";
import type { Queryable } from "../share/migrate";
import { auditWorkspace } from "./audit";
import type { WorkspaceSettingsInput } from "./schemas";
import { workspaceLogoVersion, type WorkspaceActor } from "./workspace-logo";

/** What the workspace settings page starts from. The slug is shown, never changed here. */
export interface WorkspaceSettings {
  name: string;
  slug: string;
  /** `#rrggbb`, or null for Squint's own blue. */
  brandColor: string | null;
  /** The "{name} via Squint" of its emails; null uses the workspace's name. */
  senderName: string | null;
  /** The logo's `?v=`, or null without one. */
  logoVersion: string | null;
}

interface SettingsRow {
  name: string;
  slug: string;
  brand_color: string | null;
  from_email_name: string | null;
}

export async function loadWorkspaceSettings(
  db: Queryable,
  workspaceId: string,
): Promise<WorkspaceSettings | null> {
  const { rows } = await db.query<SettingsRow>(
    "SELECT name, slug, brand_color, from_email_name FROM workspaces WHERE id = $1",
    [workspaceId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    name: row.name,
    slug: row.slug,
    brandColor: row.brand_color,
    senderName: row.from_email_name,
    logoVersion: await workspaceLogoVersion(db, workspaceId),
  };
}

/** The input's fields that differ from the stored row, by their names in the form. */
function changedFields(row: SettingsRow, input: WorkspaceSettingsInput): string[] {
  const fields: Array<[string, boolean]> = [
    ["name", row.name !== input.name],
    ["brandColor", row.brand_color !== input.brandColor],
    ["senderName", row.from_email_name !== input.senderName],
  ];
  return fields.filter(([, changed]) => changed).map(([field]) => field);
}

/**
 * Saves the workspace's name, brand color and sender name (already checked
 * by `workspaceSettingsSchema`), and records which of them changed. Saving
 * the same values again changes and records nothing.
 */
export function updateWorkspaceSettings(
  db: Database,
  actor: WorkspaceActor,
  input: WorkspaceSettingsInput,
  now: number,
): Promise<void> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<SettingsRow>(
      "SELECT name, slug, brand_color, from_email_name FROM workspaces WHERE id = $1 FOR UPDATE",
      [actor.workspaceId],
    );
    const row = rows[0];
    const changed = row ? changedFields(row, input) : [];
    if (changed.length === 0) return;
    await tx.query(
      "UPDATE workspaces SET name = $2, brand_color = $3, from_email_name = $4 WHERE id = $1",
      [actor.workspaceId, input.name, input.brandColor, input.senderName],
    );
    await auditWorkspace(tx, actor, "workspace.settings_changed", changed, now);
  });
}
