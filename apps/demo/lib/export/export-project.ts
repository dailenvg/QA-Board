import type { Project, SquintData } from "../store/types";
import { collectExport } from "./collect";
import { downloadBlob } from "./download";
import { toJson } from "./json";
import { toMarkdown } from "./markdown";
import { exportFileName } from "./paths";
import { buildZip } from "./zip";

export type ExportFormat = "zip" | "markdown" | "json";

/** Builds the export in `format` and downloads it. Returns the file name. */
export async function exportProject(
  data: SquintData,
  project: Project,
  format: ExportFormat,
): Promise<string> {
  const now = Date.now();
  const { document, files } = await collectExport(data, project, now);
  const at = new Date(now);
  if (format === "markdown") {
    const fileName = exportFileName(project.name, at, "md");
    const markdown = toMarkdown(document, { withFiles: false });
    downloadBlob(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), fileName);
    return fileName;
  }
  if (format === "json") {
    const fileName = exportFileName(project.name, at, "json");
    const json = toJson(document, { withFiles: false });
    downloadBlob(new Blob([json], { type: "application/json" }), fileName);
    return fileName;
  }
  const fileName = exportFileName(project.name, at, "zip");
  const zip = await buildZip(
    toMarkdown(document, { withFiles: true }),
    toJson(document, { withFiles: true }),
    files,
  );
  downloadBlob(zip, fileName);
  return fileName;
}
