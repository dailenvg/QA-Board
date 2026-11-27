import type { BlobSource } from "../blob-store/blob-source";
import type { Project, SquintData } from "../store/types";
import { collectExport } from "./collect";
import { downloadBlob } from "./download";
import { toJson } from "./json";
import { toMarkdown } from "./markdown";
import { exportFileName } from "./paths";
import type { ExportAudience } from "./types";
import { buildZip } from "./zip";

export type ExportFormat = "zip" | "markdown" | "json";

/**
 * Builds the export in `format` for `audience` (the team's, or one for a client, D14) and
 * downloads it. Returns the file name.
 */
export async function exportProject(
  data: SquintData,
  project: Project,
  format: ExportFormat,
  blobs: BlobSource,
  audience: ExportAudience = "team",
): Promise<string> {
  const now = Date.now();
  const { document, files } = await collectExport(data, project, now, blobs, audience);
  const at = new Date(now);
  if (format === "markdown") {
    const fileName = exportFileName(project.name, at, "md", audience);
    const markdown = toMarkdown(document, { withFiles: false });
    downloadBlob(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), fileName);
    return fileName;
  }
  if (format === "json") {
    const fileName = exportFileName(project.name, at, "json", audience);
    const json = toJson(document, { withFiles: false });
    downloadBlob(new Blob([json], { type: "application/json" }), fileName);
    return fileName;
  }
  const fileName = exportFileName(project.name, at, "zip", audience);
  const zip = await buildZip(
    toMarkdown(document, { withFiles: true }),
    toJson(document, { withFiles: true }),
    files,
  );
  downloadBlob(zip, fileName);
  return fileName;
}
