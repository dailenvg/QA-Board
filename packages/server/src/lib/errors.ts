/** HTTP status of an Octokit-style error, if it has one. */
export function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}

/** GitHub's primary or secondary rate limit: a 429, or a 403 whose headers say so. */
export function isRateLimited(error: unknown): boolean {
  const status = statusOf(error);
  if (status === 429) return true;
  if (status !== 403) return false;
  const headers =
    (error as { response?: { headers?: Record<string, unknown> } }).response?.headers ?? {};
  return headers["x-ratelimit-remaining"] === "0" || headers["retry-after"] !== undefined;
}
