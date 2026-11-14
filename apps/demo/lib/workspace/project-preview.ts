import { cache } from "react";
import { describeError } from "../auth/http";
import { database } from "../db/database";
import { brandColor, logoVersion } from "../share/brand";
import { cardLogoUri, readStoredImage, type BrandLogo } from "../share/brand-logo";
import type { Queryable } from "../share/migrate";
import type { BlobDriver } from "./blob-driver";
import { toLocation } from "./blobs";
import { idSchema } from "./schemas";

/**
 * What a project's own link (`/p/<id>`) shows anyone who has it, signed in
 * or not: the company's name, color and logo, and the project's name, so
 * the link unfurls as the company's card and a signed-out visitor sees whose
 * it is before signing in. Nothing else: no comments, snapshots, folders or
 * people. Only ids shaped like the app's random UUIDs get one: other ids the
 * API accepts (shorter, maybe guessable) answer as unknown, so only someone
 * given the link can ask. A project in the trash or archived, or a workspace archived or waiting
 * to be deleted (033), answers as an unknown id does: null.
 */
export interface ProjectPreview {
  project: string;
  company: string;
  /** `#rrggbb`, or null for the app's own accent. */
  color: string | null;
  /** `logoVersion` of the logo's key, or null without a logo. */
  logoVersion: string | null;
}

/** A random UUID, as the app makes project ids (`lib/store/id.ts`). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether an id may show its project's preview: a valid id shaped like a random UUID. */
function previewable(projectId: string): boolean {
  return idSchema.safeParse(projectId).success && UUID.test(projectId);
}

/** The live project and its workspace's logo row, under the rules above. */
const PREVIEW_FROM = `projects AS project
  JOIN workspaces AS workspace ON workspace.id = project.workspace_id
  LEFT JOIN workspace_blobs AS logo
    ON logo.workspace_id = workspace.id AND logo.key = workspace.logo_blob_key
    AND logo.project_id IS NULL
    AND starts_with(logo.key, 'ws/' || workspace.id::text || '/brand/logo/')
  WHERE project.id = $1
    AND project.deleted_at IS NULL AND project.archived_at IS NULL
    AND workspace.archived_at IS NULL AND workspace.delete_after IS NULL`;

interface PreviewRow {
  project: string;
  company: string;
  brand_color: string | null;
  logo_key: string | null;
}

interface LogoRow {
  key: string;
  bytes: Uint8Array | null;
  blob_url: string | null;
}

/** The project's preview, or null (unknown, malformed, closed: all alike). */
export async function readProjectPreview(
  db: Queryable,
  projectId: string,
): Promise<ProjectPreview | null> {
  if (!previewable(projectId)) return null;
  const { rows } = await db.query<PreviewRow>(
    `SELECT project.name AS project, workspace.name AS company, workspace.brand_color,
       logo.key AS logo_key
     FROM ${PREVIEW_FROM}`,
    [projectId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    project: row.project,
    company: row.company,
    color: brandColor(row.brand_color),
    logoVersion: row.logo_key === null ? null : logoVersion(row.logo_key),
  };
}

/** The logo of the project's workspace, under the same rules; null without one. */
export async function readProjectLogo(
  db: Queryable,
  projectId: string,
  driver?: Pick<BlobDriver, "read">,
): Promise<BrandLogo | null> {
  if (!previewable(projectId)) return null;
  const { rows } = await db.query<LogoRow>(
    `SELECT logo.key, logo.bytes, logo.blob_url FROM ${PREVIEW_FROM} AND logo.key IS NOT NULL`,
    [projectId],
  );
  const row = rows[0];
  return row ? readStoredImage({ key: row.key, location: toLocation(row) }, driver) : null;
}

/**
 * The project's preview for this request (the page and its metadata both
 * ask), or null; also null without a database, or when reading it fails
 * (logged by kind only), so the link falls back to Squint's own card.
 */
export const openProjectPreview = cache(async (projectId: string) => {
  const pending = database();
  if (!pending) return null;
  try {
    return await readProjectPreview(await pending, projectId);
  } catch (error) {
    console.error(`squint project preview: read failed (${describeError(error)})`);
    return null;
  }
});

/** A project link's card: the preview, with the logo as a data URI the card can draw. */
export interface ProjectCard {
  company: string;
  project: string;
  color: string | null;
  /** Null when there's no logo, or the card can't draw it. */
  logoUri: string | null;
}

/** The card of a project's link, or null where the preview is (and on failure). */
export async function projectCard(projectId: string): Promise<ProjectCard | null> {
  const preview = await openProjectPreview(projectId);
  const pending = database();
  if (!preview || !pending) return null;
  const { project, company, color } = preview;
  try {
    const logo = preview.logoVersion ? await readProjectLogo(await pending, projectId) : null;
    return { company, project, color, logoUri: logo && cardLogoUri(logo) };
  } catch (error) {
    console.error(`squint project preview: logo read failed (${describeError(error)})`);
    return { company, project, color, logoUri: null };
  }
}
