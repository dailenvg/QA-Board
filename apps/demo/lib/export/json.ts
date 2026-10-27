import type { ExportDocument } from "./types";

/**
 * Changelog:
 * - `squint.comments/2` (pages): image projects became page projects.
 *   `project.source` is `{ kind: "pages", origin, fileName, referenceUrl,
 *   pages }` (was `{ kind: "image", fileName, referenceUrl, width, height,
 *   file }`); each page has `id`, `number`, `name`, `width`, `height`, `file`
 *   and `omitted`, and its image is `pages/<PP>.<ext>` (was
 *   `source-image.<ext>`). `location.surface` "image" became "page", and
 *   `location.page` (`{ id, number, name }`, else null) says which page.
 *   A screenshot of a pin on a page is `screenshots/<NN>-p<PP>-<id>.<ext>`
 *   (`.jpg` for newer screenshots, `.png` for older ones).
 * - `squint.comments/1`: the first version.
 */
export const JSON_SCHEMA = "squint.comments/2";

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
