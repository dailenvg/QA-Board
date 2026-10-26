const NET_ERROR = /net::ERR_[A-Z0-9_]+/;
const URL_LIKE = /[a-z][a-z0-9+.-]*:\/\/\S*/gi;
const PATH_LIKE = /(^|\s)\/\S*/g;
const QUERY_LIKE = /[?#&]\S*/g;
const SECRET_PAIR = /\b\w*(token|secret|key|password|sig|auth)\w*=\S*/gi;
const MAX_LENGTH = 200;

/**
 * An error's first line, safe for logs. Playwright ends navigation errors with
 * ` at <the full target URL>`, query and all, and a URL can carry tokens, so
 * a network error logs only its `net::ERR_*` code, and anything else loses
 * everything from " at " on plus any URL, path, query or `key=value` secret left.
 */
export function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const line = message.split("\n")[0] ?? "";
  const code = NET_ERROR.exec(line)?.[0];
  if (code) return code;
  return (line.split(" at ")[0] ?? "")
    .replace(URL_LIKE, "<url>")
    .replace(PATH_LIKE, "$1<path>")
    .replace(QUERY_LIKE, "")
    .replace(SECRET_PAIR, "<redacted>")
    .slice(0, MAX_LENGTH);
}
