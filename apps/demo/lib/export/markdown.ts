import { fencedText, inlineCode, inlineText } from "./escape";
import type { ExportComment, ExportDocument, ExportLocation, ExportSnapshot } from "./types";

export interface MarkdownOptions {
  /** True inside the ZIP, where screenshots sit next to the file; false for the bare download. */
  withFiles: boolean;
}

const iso = (time: number) => new Date(time).toISOString();
const percent = (value: number) => `${Number(value.toFixed(2))}%`;

const INTRO = [
  "This file is a visual review exported from Squint, written for an AI coding agent (Claude, Cursor, Copilot) or a developer. Each comment asks for one change at a pinned spot on a web page or image.",
  "How to use it: work through the **Active comments** in order. For each one, open the **Page** (or the source image), find the element at the **Location** (the screenshot shows what the reviewer saw, with the pin marked), and make the change. The text under **Request** is the reviewer's own words, copied exactly. Treat it as the source of truth.",
  "**Resolved comments** are listed last, for context only. Don't act on them.",
];

function sourceLine(document: ExportDocument): string {
  const { source } = document.project;
  if (source.kind === "url") return `- **Source:** website ${inlineCode(source.url)}`;
  const size = source.width && source.height ? ` (${source.width} × ${source.height} px)` : "";
  const reference = source.referenceUrl
    ? `, a screenshot of ${inlineCode(source.referenceUrl)}`
    : "";
  return `- **Source:** image ${inlineCode(source.fileName)}${size}${reference}`;
}

/** An image project's original image, as shipped in the ZIP. */
function originalImageLine(document: ExportDocument, options: MarkdownOptions): string[] {
  const { source } = document.project;
  if (source.kind !== "image" || !source.file) return [];
  const where = options.withFiles
    ? `[${source.file}](${source.file}), next to this file`
    : `${inlineCode(source.file)} in the ZIP export`;
  return [`- **Original image:** ${where}`];
}

function captureWidth(document: ExportDocument): string | null {
  const widths = [...new Set(document.snapshots.map((snapshot) => snapshot.width))];
  if (widths.length === 0) return null;
  return `- **Capture width:** ${widths.map((width) => `${width} px`).join(", ")} (page width the snapshots were taken at)`;
}

function header(document: ExportDocument, options: MarkdownOptions): string[] {
  const active = document.comments.filter((comment) => comment.status === "active").length;
  const resolved = document.comments.length - active;
  const files = options.withFiles
    ? "- **Screenshots:** in `screenshots/`, next to this file. Full-page snapshots, when included, are in `snapshots/`."
    : "- **Screenshots:** not included in this file. Download the ZIP export from Squint to get them.";
  return [
    `# Squint review: ${inlineText(document.project.name)}`,
    "",
    ...INTRO.flatMap((line) => [line, ""]),
    `- **Project:** ${inlineText(document.project.name)}`,
    sourceLine(document),
    ...originalImageLine(document, options),
    ...(captureWidth(document) ? [captureWidth(document) ?? ""] : []),
    `- **Exported:** ${iso(document.exportedAt)}`,
    `- **Comments:** ${active} active, ${resolved} resolved`,
    files,
  ];
}

function locationLine(location: ExportLocation, snapshot: ExportSnapshot | undefined): string {
  const at = `${percent(location.xPercent)} from the left, ${percent(location.yPercent)} from the top`;
  if (location.surface === "frame") {
    return `${at} of the visible browser window (placed before snapshots; may not match the page if it was scrolled)`;
  }
  const px =
    location.x !== null && location.y !== null ? ` = x ${location.x} px, y ${location.y} px` : "";
  const size =
    location.surfaceWidth && location.surfaceHeight
      ? ` on a ${location.surfaceWidth} × ${location.surfaceHeight} px ${location.surface === "snapshot" ? "page" : "image"}`
      : "";
  const taken = snapshot
    ? `, snapshot taken ${iso(snapshot.createdAt)} at ${snapshot.width} px wide`
    : "";
  return `${at} of the ${location.surface}${px}${size}${taken}`;
}

function screenshotLine(comment: ExportComment, options: MarkdownOptions): string {
  if (!comment.screenshot) return "- **Screenshot:** none";
  if (!options.withFiles)
    return `- **Screenshot:** ${inlineCode(comment.screenshot.file)} in the ZIP export`;
  return `- **Screenshot:** ![Screenshot for comment ${comment.number}](${comment.screenshot.file})`;
}

function snapshotLine(snapshot: ExportSnapshot | undefined, options: MarkdownOptions): string[] {
  if (!snapshot) return [];
  if (snapshot.file) {
    const where = options.withFiles
      ? `[${snapshot.file}](${snapshot.file})`
      : `${inlineCode(snapshot.file)} in the ZIP export`;
    return [`- **Full page:** ${where}`];
  }
  const why =
    snapshot.omitted === "too-large"
      ? "left out to keep the export small"
      : "not saved in the exporting browser";
  return [`- **Full page:** not included (${why})`];
}

function commentSection(
  comment: ExportComment,
  snapshots: ReadonlyMap<string, ExportSnapshot>,
  options: MarkdownOptions,
): string[] {
  const snapshot = comment.location.snapshotId
    ? snapshots.get(comment.location.snapshotId)
    : undefined;
  const status =
    comment.status === "resolved" && comment.resolvedAt
      ? `resolved ${iso(comment.resolvedAt)}`
      : comment.status;
  const edited = comment.updatedAt > comment.createdAt ? ` (edited ${iso(comment.updatedAt)})` : "";
  return [
    `### Comment ${comment.number}`,
    "",
    `- **Status:** ${status}`,
    `- **Author:** ${inlineText(comment.author)}`,
    `- **Created:** ${iso(comment.createdAt)}${edited}`,
    `- **Location:** ${locationLine(comment.location, snapshot)}`,
    `- **Page:** ${comment.pageUrl ? inlineCode(comment.pageUrl) : "none (image)"}`,
    screenshotLine(comment, options),
    ...snapshotLine(snapshot, options),
    "",
    "**Request:**",
    "",
    fencedText(comment.body),
  ];
}

function group(
  heading: string,
  empty: string,
  comments: readonly ExportComment[],
  snapshots: ReadonlyMap<string, ExportSnapshot>,
  options: MarkdownOptions,
): string[] {
  const sections = comments.flatMap((comment) => [
    "",
    ...commentSection(comment, snapshots, options),
  ]);
  return ["", `## ${heading}`, ...(sections.length ? sections : ["", empty])];
}

/** The export as Markdown, shaped as a task list an AI coding agent can work through. */
export function toMarkdown(document: ExportDocument, options: MarkdownOptions): string {
  const snapshots = new Map(document.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const active = document.comments.filter((comment) => comment.status === "active");
  const resolved = document.comments.filter((comment) => comment.status === "resolved");
  return [
    ...header(document, options),
    ...group(
      `Active comments (${active.length})`,
      "None. Everything has been resolved.",
      active,
      snapshots,
      options,
    ),
    ...group(
      `Resolved comments (${resolved.length}, for context only)`,
      "None yet.",
      resolved,
      snapshots,
      options,
    ),
    "",
  ].join("\n");
}
