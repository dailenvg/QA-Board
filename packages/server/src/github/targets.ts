import type { Octokit } from "@octokit/rest";
import { escapeInline } from "./markdown";
import type { RepoRef } from "./repo";

export function issueTitle(branch: string): string {
  return `[pinpoint] ${branch}`;
}

/** Open PR whose head is `owner:branch`, if any. */
export async function findPullRequest(
  octokit: Octokit,
  { owner, repo }: RepoRef,
  branch: string,
): Promise<number | null> {
  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "open",
    head: `${owner}:${branch}`,
    per_page: 1,
  });
  return data[0]?.number ?? null;
}

/** Open fallback issues for a branch created by `author`, oldest first. */
export async function findFallbackIssues(
  octokit: Octokit,
  { owner, repo }: RepoRef,
  branch: string,
  author: string,
): Promise<number[]> {
  const title = issueTitle(branch);
  const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner,
    repo,
    state: "open",
    creator: author,
    per_page: 100,
  });
  return issues
    .filter((issue) => !issue.pull_request && issue.title === title)
    .map((issue) => issue.number)
    .sort((a, b) => a - b);
}

export async function createFallbackIssue(
  octokit: Octokit,
  { owner, repo }: RepoRef,
  branch: string,
): Promise<number> {
  const { data } = await octokit.rest.issues.create({
    owner,
    repo,
    title: issueTitle(branch),
    body: `Feedback left with pinpoint on the **${escapeInline(branch)}** preview. There is no open pull request for this branch yet, so each comment below is one pin.`,
  });
  return data.number;
}
