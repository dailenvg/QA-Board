import { distinctPageName } from "../store/pages";
import { fencedText, inlineCode, inlineText } from "./escape";
import type {
  ExportComment,
  ExportDocument,
  ExportLocation,
  ExportPage,
  ExportSnapshot,
  ExportSource,
  OmittedReason,
} from "./types";

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

type PagesSource = Extract<ExportSource, { kind: "pages" }>;

/** ", `about.png`"; nothing for a PDF page named after its number. */
function nameText(page: ExportPage): string {
  const name = distinctPageName(page.name, page.number);
  return name ? `, ${inlineCode(name)}` : "";
}

const sizeText = (page: ExportPage) =>
  page.width && page.height ? ` (${page.width} × ${page.height} px)` : "";

/** What a page project's pages are, in a few words. */
function pagesSummary(source: PagesSource): string {
  const [first] = source.pages;
  const name = inlineCode(source.fileName);
  const count = source.pages.length;
  if (source.origin === "pdf") return `PDF ${name}, ${count === 1 ? "1 page" : `${count} pages`}`;
  if (source.pages.length === 1 && first) return `image ${name}${sizeText(first)}`;
  return `${source.pages.length} images, starting with ${name}`;
}

function sourceLine(document: ExportDocument): string {
  const { source } = document.project;
  if (source.kind === "url") return `- **Source:** website ${inlineCode(source.url)}`;
  const reference = source.referenceUrl
    ? `, a screenshot of ${inlineCode(source.referenceUrl)}`
    : "";
  return `- **Source:** ${pagesSummary(source)}${reference}`;
}

function omittedText(reason: OmittedReason | null): string {
  return reason === "too-large"
    ? "left out to keep the export small"
    : "not saved in the exporting browser";
}

/** Where a page's image is: linked in the ZIP copy, named in the bare one, or why it's missing. */
function pageFile(page: ExportPage, options: MarkdownOptions): string {
  if (!page.file) return `not included (${omittedText(page.omitted)})`;
  return options.withFiles
    ? `[${page.file}](${page.file})`
    : `${inlineCode(page.file)} in the ZIP export`;
}

/** A page project's pages, in reading order, with their images. */
function pagesList(document: ExportDocument, options: MarkdownOptions): string[] {
  const { source } = document.project;
  if (source.kind !== "pages") return [];
  return [
    "- **Pages:**",
    ...source.pages.map(
      (page) =>
        `  - Page ${page.number}${nameText(page)}${sizeText(page)}: ${pageFile(page, options)}`,
    ),
  ];
}

/**
 * A website's pages, when comments sit on more than one: each comment's
 * **Page** names its own, and this lists them all up front.
 */
function sitePagesList(document: ExportDocument): string[] {
  if (document.project.source.kind !== "url") return [];
  const pages = [...new Set(document.comments.flatMap((comment) => comment.pageUrl ?? []))];
  if (pages.length < 2) return [];
  return ["- **Pages reviewed:**", ...pages.sort().map((page) => `  - ${inlineCode(page)}`)];
}

function captureWidth(document: ExportDocument): string | null {
  const widths = [...new Set(document.snapshots.map((snapshot) => snapshot.width))];
  if (widths.length === 0) return null;
  return `- **Capture width:** ${widths.map((width) => `${width} px`).join(", ")} (page width the snapshots were taken at)`;
}

function header(document: ExportDocument, options: MarkdownOptions): string[] {
  const active = document.comments.filter((comment) => comment.status === "active").length;
  const resolved = document.comments.length - active;
  const pages = document.project.source.kind === "pages";
  const files = options.withFiles
    ? pages
      ? "- **Screenshots:** in `screenshots/`, next to this file. Page images, when included, are in `pages/`."
      : "- **Screenshots:** in `screenshots/`, next to this file. Full-page snapshots, when included, are in `snapshots/`."
    : "- **Screenshots:** not included in this file. Download the ZIP export from Squint to get them.";
  return [
    `# Squint review: ${inlineText(document.project.name)}`,
    "",
    ...INTRO.flatMap((line) => [line, ""]),
    `- **Project:** ${inlineText(document.project.name)}`,
    sourceLine(document),
    ...pagesList(document, options),
    ...sitePagesList(document),
    ...(captureWidth(document) ? [captureWidth(document) ?? ""] : []),
    `- **Exported:** ${iso(document.exportedAt)}`,
    `- **Comments:** ${active} active, ${resolved} resolved`,
    files,
  ];
}

/** What the pin's surface is called: a snapshot's page, a PDF page, or an image. */
function surfaceNoun(location: ExportLocation, source: ExportSource): string {
  if (location.surface === "snapshot") return "page";
  return source.kind === "pages" && source.origin === "pdf" ? "page" : "image";
}

function locationLine(
  location: ExportLocation,
  snapshot: ExportSnapshot | undefined,
  source: ExportSource,
): string {
  const at = `${percent(location.xPercent)} from the left, ${percent(location.yPercent)} from the top`;
  if (location.surface === "frame") {
    return `${at} of the visible browser window (placed before snapshots; may not match the page if it was scrolled)`;
  }
  const px =
    location.x !== null && location.y !== null ? ` = x ${location.x} px, y ${location.y} px` : "";
  const size =
    location.surfaceWidth && location.surfaceHeight
      ? ` on a ${location.surfaceWidth} × ${location.surfaceHeight} px ${surfaceNoun(location, source)}`
      : "";
  const taken = snapshot
    ? `, snapshot taken ${iso(snapshot.createdAt)} at ${snapshot.width} px wide`
    : "";
  const surface = location.page ? `page ${location.page.number}` : `the ${location.surface}`;
  return `${at} of ${surface}${px}${size}${taken}`;
}

/**
 * Where the pinned thing is: the page of a page project (and the site it
 * shows, if any), else the web page's address.
 */
function pageLines(
  comment: ExportComment,
  source: ExportSource,
  options: MarkdownOptions,
): string[] {
  const { page } = comment.location;
  const found =
    page && source.kind === "pages" ? source.pages.find((entry) => entry.id === page.id) : null;
  if (!page || !found || source.kind !== "pages") {
    return [`- **Page:** ${comment.pageUrl ? inlineCode(comment.pageUrl) : "none (image)"}`];
  }
  const site = comment.pageUrl ? [`- **Site:** ${inlineCode(comment.pageUrl)}`] : [];
  return [
    `- **Page:** ${page.number} of ${source.pages.length}${nameText(found)}; image ${pageFile(found, options)}`,
    ...site,
  ];
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
  return [`- **Full page:** not included (${omittedText(snapshot.omitted)})`];
}

function commentSection(
  comment: ExportComment,
  snapshots: ReadonlyMap<string, ExportSnapshot>,
  source: ExportSource,
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
    `- **Location:** ${locationLine(comment.location, snapshot, source)}`,
    ...pageLines(comment, source, options),
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
  source: ExportSource,
  options: MarkdownOptions,
): string[] {
  const sections = comments.flatMap((comment) => [
    "",
    ...commentSection(comment, snapshots, source, options),
  ]);
  return ["", `## ${heading}`, ...(sections.length ? sections : ["", empty])];
}

/** The export as Markdown, shaped as a task list an AI coding agent can work through. */
export function toMarkdown(document: ExportDocument, options: MarkdownOptions): string {
  const snapshots = new Map(document.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const active = document.comments.filter((comment) => comment.status === "active");
  const resolved = document.comments.filter((comment) => comment.status === "resolved");
  const { source } = document.project;
  return [
    ...header(document, options),
    ...group(
      `Active comments (${active.length})`,
      "None. Everything has been resolved.",
      active,
      snapshots,
      source,
      options,
    ),
    ...group(
      `Resolved comments (${resolved.length}, for context only)`,
      "None yet.",
      resolved,
      snapshots,
      source,
      options,
    ),
    "",
  ].join("\n");
}
