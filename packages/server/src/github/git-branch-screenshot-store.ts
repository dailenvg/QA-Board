import type { Octokit } from "@octokit/rest";
import { encodeBase64 } from "../lib/base64";
import { statusOf } from "../lib/errors";
import type { RemoveScreenshotParams, ScreenshotStore } from "../storage";
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

interface TreeEntry {
  path: string;
  mode: "100644";
  type: "blob";
  /** Null deletes the file. */
  sha: string | null;
}

/**
 * Stores screenshots as files on an orphan branch through the Git Data API
 * (blob, tree, commit, ref). Creates the branch with a parentless commit on
 * first use, and retries when a concurrent upload wins the ref update.
 * `remove` deletes expired pins' files in one commit.
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

  /**
   * Commits the entries `entriesFor` picks against the branch's current tree
   * (undefined before the branch exists). False when it picks none.
   */
  async function commitChange(
    message: string,
    entriesFor: (baseTree: string | undefined) => Promise<TreeEntry[]>,
  ): Promise<boolean> {
    const head = await currentHead();
    const baseTree = head
      ? (await git.getCommit({ owner, repo, commit_sha: head })).data.tree.sha
      : undefined;
    const entries = await entriesFor(baseTree);
    if (entries.length === 0) return false;
    const { data: tree } = await git.createTree({
      owner,
      repo,
      tree: entries,
      ...(baseTree ? { base_tree: baseTree } : {}),
    });
    const { data: commit } = await git.createCommit({
      owner,
      repo,
      message,
      tree: tree.sha,
      parents: head ? [head] : [],
    });
    if (head) {
      await git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.sha, force: false });
    } else {
      await git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: commit.sha });
    }
    return true;
  }

  /** Runs `change` again when another writer moved the branch first. */
  async function withRetry<T>(change: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await change();
      } catch (error) {
        if (!isRefConflict(error) || attempt >= maxAttempts) throw error;
      }
    }
  }

  function urlOf(path: string): string {
    return `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(branch)}/${encodePath(path)}?raw=true`;
  }

  /** The file `save` stored for this pin, when `url` is what it returned; else null. */
  function ownPath({ branch: pinBranch, pinId, url }: RemoveScreenshotParams): string | null {
    const paths = Object.values(EXTENSIONS).map(
      (ext) => `${slugifyBranch(pinBranch)}/${pinId}.${ext}`,
    );
    return paths.find((path) => urlOf(path) === url) ?? null;
  }

  async function filesIn(treeSha: string): Promise<Set<string>> {
    const { data } = await git.getTree({ owner, repo, tree_sha: treeSha, recursive: "true" });
    return new Set(
      data.tree.flatMap((entry) => (entry.type === "blob" && entry.path ? [entry.path] : [])),
    );
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
      const entry: TreeEntry = { path, mode: "100644", type: "blob", sha: blob.sha };
      await withRetry(() => commitChange(`pinpoint: add ${path}`, () => Promise.resolve([entry])));
      return urlOf(path);
    },

    async remove(screenshots) {
      const wanted = new Set(screenshots.flatMap((params) => ownPath(params) ?? []));
      if (wanted.size === 0) return 0;
      let removed = 0;
      await withRetry(() =>
        commitChange("pinpoint: remove expired screenshots", async (baseTree) => {
          const present = baseTree ? await filesIn(baseTree) : new Set<string>();
          const entries = [...wanted]
            .filter((path) => present.has(path))
            .map((path): TreeEntry => ({ path, mode: "100644", type: "blob", sha: null }));
          removed = entries.length;
          return entries;
        }),
      );
      return removed;
    },
  };
}
