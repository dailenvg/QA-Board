import { headers } from "next/headers";

/** /review-link exists on Vercel previews, or locally when explicitly enabled. */
export function reviewLinkEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === "preview" || env.PINPOINT_ENABLE_REVIEW_LINK === "1";
}

/** Stable branch URL on Vercel; otherwise the origin of the current request. */
export async function deploymentOrigin(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  if (env.VERCEL_BRANCH_URL) return `https://${env.VERCEL_BRANCH_URL}`;
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${protocol}://${host}`;
}

export function buildReviewUrl(origin: string, token: string): string {
  const url = new URL("/", origin);
  url.searchParams.set("review", token);
  return url.toString();
}
