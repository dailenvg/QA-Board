import type { ExportDocument } from "./types";

export const JSON_SCHEMA = "squint.comments/1";

const iso = (time: number) => new Date(time).toISOString();
const isoOrNull = (time: number | null) => (time === null ? null : iso(time));

/**
 * The export as versioned JSON. Field names are stable within a schema
 * version; dates are ISO 8601 strings; file paths are relative to the ZIP root.
 */
export function toJson(document: ExportDocument, options: { withFiles: boolean }): string {
  const { project } = document;
  const active = document.comments.filter((comment) => comment.status === "active").length;
  const body = {
    schema: JSON_SCHEMA,
    exportedAt: iso(document.exportedAt),
    /** False for the bare JSON download: the paths describe the ZIP export's layout. */
    filesIncluded: options.withFiles,
    project: {
      id: project.id,
      name: project.name,
      source: project.source,
      createdAt: iso(project.createdAt),
      updatedAt: iso(project.updatedAt),
    },
    counts: { active, resolved: document.comments.length - active },
    snapshots: document.snapshots.map((snapshot) => ({
      ...snapshot,
      createdAt: iso(snapshot.createdAt),
    })),
    comments: document.comments.map((comment) => ({
      ...comment,
      createdAt: iso(comment.createdAt),
      updatedAt: iso(comment.updatedAt),
      resolvedAt: isoOrNull(comment.resolvedAt),
      edited: comment.updatedAt > comment.createdAt,
    })),
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}
