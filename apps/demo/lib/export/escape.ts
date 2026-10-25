/**
 * Markdown escaping for user text. Inline text gets every character that could
 * start markup backslash-escaped; longer text goes in a fenced block whose
 * fence is longer than any backtick run inside it, so it stays verbatim.
 */

const INLINE_SPECIAL = /[\\`*_{}[\]()<>#+\-!|~&]/g;

/** One line of user text (a name, a file name) as plain Markdown text. */
export function inlineText(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(INLINE_SPECIAL, "\\$&");
}

function longestBacktickRun(text: string): number {
  return Math.max(0, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length));
}

/** Inline code (for URLs and paths) that no backtick inside can close early. */
export function inlineCode(text: string): string {
  const line = text.replace(/\s+/g, " ");
  const fence = "`".repeat(longestBacktickRun(line) + 1);
  const pad = line.startsWith("`") || line.endsWith("`") ? " " : "";
  return `${fence}${pad}${line}${pad}${fence}`;
}

/** A fenced block holding text exactly as written. */
export function fencedText(text: string): string {
  const fence = "`".repeat(Math.max(3, longestBacktickRun(text) + 1));
  return `${fence}text\n${text.replace(/\r\n?/g, "\n")}\n${fence}`;
}
