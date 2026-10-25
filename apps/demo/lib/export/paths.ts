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

/** `screenshots/03-1a2b3c4d.png`: pin number, padded so files sort in pin order. */
export function screenshotPath(number: number, commentId: string, total: number): string {
  const width = Math.max(2, String(total).length);
  const shortId = commentId.replace(/[^a-z\d]/gi, "").slice(0, 8) || "comment";
  return `screenshots/${String(number).padStart(width, "0")}-${shortId}.png`;
}

export function snapshotPath(snapshotId: string, mimeType: string): string {
  return `snapshots/${snapshotId.replace(/[^a-z\d-]/gi, "")}.${extensionFor(mimeType)}`;
}

export function sourceImagePath(mimeType: string): string {
  return `source-image.${extensionFor(mimeType)}`;
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
