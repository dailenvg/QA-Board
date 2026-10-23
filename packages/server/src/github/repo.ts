export interface RepoRef {
  owner: string;
  repo: string;
}

/** Parses `owner/name` as used by `GITHUB_REPO`. */
export function parseRepo(value: string): RepoRef {
  const match = /^([\w.-]+)\/([\w.-]+)$/.exec(value.trim());
  if (!match?.[1] || !match[2]) {
    throw new Error(`GITHUB_REPO must look like "owner/name", received "${value}"`);
  }
  return { owner: match[1], repo: match[2] };
}

/** Filesystem- and URL-safe folder name for a branch. */
export function slugifyBranch(branch: string): string {
  const slug = branch
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return slug || "branch";
}
