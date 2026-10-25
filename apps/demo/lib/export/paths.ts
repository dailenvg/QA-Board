/** File layout inside the ZIP. The bare Markdown and JSON downloads describe the same layout. */

export const MARKDOWN_FILE = "comments.md";
export const JSON_FILE = "comments.json";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function extensionFor(mimeType: string): string {
  return EXTENSIONS[mimeType] ?? "img";
}

/** `07` of 12, `007` of 120: numbers padded so files sort in order. */
function padded(number: number, total: number): string {
  return String(number).padStart(Math.max(2, String(total).length), "0");
}

/** Where a screenshot's pin is, for its file name: page `number` of `total`. */
export interface PageNumber {
  number: number;
  total: number;
}

/**
 * `screenshots/03-1a2b3c4d.png`: pin number, padded so files sort in pin
 * order. A pin on a page names it too: `screenshots/03-p02-1a2b3c4d.png`.
 */
export function screenshotPath(
  number: number,
  commentId: string,
  total: number,
  page: PageNumber | null = null,
): string {
  const shortId = commentId.replace(/[^a-z\d]/gi, "").slice(0, 8) || "comment";
  const onPage = page ? `p${padded(page.number, page.total)}-` : "";
  return `screenshots/${padded(number, total)}-${onPage}${shortId}.png`;
}

export function snapshotPath(snapshotId: string, mimeType: string): string {
  return `snapshots/${snapshotId.replace(/[^a-z\d-]/gi, "")}.${extensionFor(mimeType)}`;
}

/** `pages/02.webp`: a page's image, numbered in reading order. */
export function pagePath(page: PageNumber, mimeType: string): string {
  return `pages/${padded(page.number, page.total)}.${extensionFor(mimeType)}`;
}

/** Lowercase ASCII words joined by hyphens, for file names. */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\d]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "project";
}

/** `homepage-comments-2026-10-24.zip`, dated in the exporter's time zone. */
export function exportFileName(projectName: string, at: Date, extension: string): string {
  const date = [at.getFullYear(), at.getMonth() + 1, at.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
  return `${slugify(projectName)}-comments-${date}.${extension}`;
}
