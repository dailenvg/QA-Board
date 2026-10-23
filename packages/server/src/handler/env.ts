export const LOCAL_BRANCH = "local";

function withProtocol(host: string | undefined): string | undefined {
  if (!host) return undefined;
  return /^https?:\/\//.test(host) ? host : `https://${host}`;
}

/** Git branch of this deployment: `VERCEL_GIT_COMMIT_REF`, else "local". */
export function branchFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return env.VERCEL_GIT_COMMIT_REF?.trim() || LOCAL_BRANCH;
}

/** URL of this specific deployment (`VERCEL_URL`), if known. */
export function deploymentUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return withProtocol(env.VERCEL_URL ?? env.VERCEL_BRANCH_URL);
}

/**
 * Stable origin for deep links. Prefers the branch alias
 * (`VERCEL_BRANCH_URL`) so links survive redeploys of the same branch.
 */
export function linkBaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return withProtocol(env.VERCEL_BRANCH_URL ?? env.VERCEL_URL);
}
