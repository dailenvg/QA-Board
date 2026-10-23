import type { Octokit } from "@octokit/rest";
import { encodeBase64 } from "../lib/base64";
import { statusOf } from "../lib/errors";
import type { ScreenshotStore } from "../storage";
import { slugifyBranch, type RepoRef } from "./repo";

export const DEFAULT_ASSETS_BRANCH = "pinpoint-assets";

export interface GitBranchScreenshotStoreOptions extends RepoRef {
  octokit: Octokit;
  /** Orphan branch that holds the images. Defaults to `pinpoint-assets`. */
  branch?: string;
  /** Attempts when another writer moves the branch first. Defaults to 4. */
  maxAttempts?: number;
}

const EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg" } as const;

/** 422 = not a fast-forward / ref already exists; 409 = conflicting update. */
function isRefConflict(error: unknown): boolean {
  const status = statusOf(error);
  return status === 422 || status === 409;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * Stores screenshots as files on an orphan branch through the Git Data API
 * (blob, tree, commit, ref). Creates the branch with a parentless commit on
 * first use, and retries when a concurrent upload wins the ref update.
 */
export function createGitBranchScreenshotStore({
  octokit,
  owner,
  repo,
  branch = DEFAULT_ASSETS_BRANCH,
  maxAttempts = 4,
}: GitBranchScreenshotStoreOptions): ScreenshotStore {
  const { git } = octokit.rest;

  async function currentHead(): Promise<string | null> {
    try {
      const { data } = await git.getRef({ owner, repo, ref: `heads/${branch}` });
      return data.object.sha;
    } catch (error) {
      if (statusOf(error) === 404) return null;
      throw error;
    }
  }

  async function commitFile(path: string, blobSha: string): Promise<void> {
    const head = await currentHead();
    const baseTree = head
      ? (await git.getCommit({ owner, repo, commit_sha: head })).data.tree.sha
      : undefined;
    const { data: tree } = await git.createTree({
      owner,
      repo,
      tree: [{ path, mode: "100644", type: "blob", sha: blobSha }],
      ...(baseTree ? { base_tree: baseTree } : {}),
    });
    const { data: commit } = await git.createCommit({
      owner,
      repo,
      message: `pinpoint: add ${path}`,
      tree: tree.sha,
      parents: head ? [head] : [],
    });
    if (head) {
      await git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.sha, force: false });
    } else {
      await git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: commit.sha });
    }
  }

  return {
    async save({ branch: pinBranch, pinId, screenshot }) {
      const path = `${slugifyBranch(pinBranch)}/${pinId}.${EXTENSIONS[screenshot.contentType]}`;
      const { data: blob } = await git.createBlob({
        owner,
        repo,
        content: encodeBase64(screenshot.data),
        encoding: "base64",
      });

      for (let attempt = 1; ; attempt += 1) {
        try {
          await commitFile(path, blob.sha);
          break;
        } catch (error) {
          if (!isRefConflict(error) || attempt >= maxAttempts) throw error;
        }
      }
      return `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(branch)}/${encodePath(path)}?raw=true`;
    },
  };
}
