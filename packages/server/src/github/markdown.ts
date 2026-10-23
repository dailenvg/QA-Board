const MARKDOWN_SPECIAL = /[\\`*_{}[\]()#+\-.!|~:]/g;

/**
 * Makes untrusted text render literally in GitHub Markdown: HTML is
 * entity-encoded (so it can never open a tag or an HTML comment), Markdown
 * syntax is backslash-escaped, and @mentions are broken with a zero-width
 * space so reviewers cannot ping people through a comment.
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(MARKDOWN_SPECIAL, "\\$&")
    .replace(/@/g, "@&#8203;");
}

/** Single-line variant for names and paths. */
export function escapeInline(text: string): string {
  return escapeMarkdown(text.replace(/\s+/g, " ").trim());
}

/** Escaped multi-line text as a Markdown blockquote. */
export function blockquote(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => (line.trim() === "" ? ">" : `> ${escapeMarkdown(line)}`))
    .join("\n");
}

/** URL safe to place inside `[text](url)`; non-http(s) URLs become null. */
export function linkTarget(url: string | null): string | null {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return url.replace(/[()<>\s"']/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
