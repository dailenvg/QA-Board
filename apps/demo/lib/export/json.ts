import type { ExportDocument } from "./types";

/**
 * Changelog:
 * - `squint.comments/3` (team only, D39): comments are numbered in two
 *   sequences. `number` is now within the comment's own sequence (1..n for
 *   comments clients see, 1..n for team-only ones), so it no longer names a
 *   comment on its own; `label` does: "4", or "T1" for a team-only comment.
 *   Each comment and reply has `teamOnly`. A team-only comment's screenshot is
 *   `screenshots/T<NN>-…`, padded over the team-only count. `audience` says who
 *   the export is for: "team" (everything, team-only marked) or "client"
 *   (only what the review link shows, with every `clientInfo` null). Comments
 *   are in pin order (when each was made) within active and resolved.
 * - `squint.comments/2` (pages): image projects became page projects.
 *   `project.source` is `{ kind: "pages", origin, fileName, referenceUrl,
 *   pages }` (was `{ kind: "image", fileName, referenceUrl, width, height,
 *   file }`); each page has `id`, `number`, `name`, `width`, `height`, `file`
 *   and `omitted`, and its image is `pages/<PP>.<ext>` (was
 *   `source-image.<ext>`). `location.surface` "image" became "page", and
 *   `location.page` (`{ id, number, name }`, else null) says which page.
 *   A screenshot of a pin on a page is `screenshots/<NN>-p<PP>-<id>.<ext>`
 *   (`.jpg` for newer screenshots, `.png` for older ones). Added since,
 *   without a new version: each comment's `clientInfo`, the browser it was
 *   posted from as recorded (`userAgent`, `viewport`, `dpr`, `platform`), or null;
 *   and its `replies`, oldest first, each with `id`, `author`, `body`,
 *   `createdAt`, `editedAt` (null if never), `fromClient` and `clientInfo`;
 *   and its `priority`, "must", "should" or "nit" (Must fix, Should fix, Nit), or null.
 * - `squint.comments/1`: the first version.
 */
export const JSON_SCHEMA = "squint.comments/3";

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
    audience: document.audience,
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
      replies: comment.replies.map((reply) => ({
        ...reply,
        createdAt: iso(reply.createdAt),
        editedAt: isoOrNull(reply.editedAt),
      })),
      edited: comment.updatedAt > comment.createdAt,
    })),
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}
