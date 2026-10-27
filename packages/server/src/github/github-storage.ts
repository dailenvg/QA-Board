import { Octokit } from "@octokit/rest";
import { TtlCache } from "../lib/ttl-cache";
import {
  PinNotFoundError,
  type PinDraft,
  type ScreenshotStore,
  type StorageAdapter,
} from "../storage";
import type { Pin } from "../types";
import { decodePinComment, encodePinComment } from "./codec";
import { expireGitHubPins } from "./expiry";
import {
  createGitBranchScreenshotStore,
  DEFAULT_ASSETS_BRANCH,
} from "./git-branch-screenshot-store";
import { parseRepo, type RepoRef } from "./repo";
import { createFallbackIssue, findFallbackIssues, findPullRequest } from "./targets";

export interface GitHubStorageOptions {
  /** `owner/name`, usually `process.env.GITHUB_REPO`. */
  repo: string;
  /** Token with contents:write, issues:write, pull_requests:read, metadata:read. */
  token?: string;
  /** Pre-built client; takes precedence over `token`. Handy for tests and GitHub Apps. */
  octokit?: Octokit;
  /**
   * Login whose comments are trusted. Defaults to the token's own user
   * (`GET /user`). GitHub App installation tokens must pass `"<app-slug>[bot]"`.
   */
  authorLogin?: string;
  /** Screenshot destination. Defaults to the orphan-branch store; `false` drops images. */
  screenshots?: ScreenshotStore | false;
  /** Orphan branch for the default screenshot store. Defaults to `pinpoint-assets`. */
  assetsBranch?: string;
  /** Read cache lifetime per instance. Defaults to 15 s; writes invalidate it. */
  cacheTtlMs?: number;
  /** Pause between writes in `expire`, as GitHub asks of bulk mutations. Defaults to 1000 ms. */
  writeIntervalMs?: number;
  now?: () => number;
}

interface StoredPin {
  pin: Pin;
  commentId: number;
}

const DEFAULT_CACHE_TTL_MS = 15_000;
const DEFAULT_WRITE_INTERVAL_MS = 1_000;

function byCreatedAt(a: StoredPin, b: StoredPin): number {
  return a.pin.createdAt.localeCompare(b.pin.createdAt);
}

/**
 * Stores each pin as one comment on the branch's open pull request, or on a
 * `[pinpoint] <branch>` issue when there is no PR. The comment carries the
 * pin as hidden JSON plus a readable rendering; replies and resolves edit it.
 */
export function createGitHubStorage(options: GitHubStorageOptions): StorageAdapter {
  const ref: RepoRef = parseRepo(options.repo);
  if (!options.octokit && !options.token) {
    throw new Error("createGitHubStorage needs a `token` (GITHUB_TOKEN) or an `octokit` instance");
  }
  const octokit = options.octokit ?? new Octokit({ auth: options.token, userAgent: "pinpoint" });
  const screenshots =
    options.screenshots === false
      ? null
      : (options.screenshots ??
        createGitBranchScreenshotStore({
          octokit,
          ...ref,
          branch: options.assetsBranch ?? DEFAULT_ASSETS_BRANCH,
        }));
  const now = options.now ?? Date.now;
  const cache = new TtlCache<StoredPin[]>(options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS, now);
  const writeIntervalMs = options.writeIntervalMs ?? DEFAULT_WRITE_INTERVAL_MS;
  let login: Promise<string> | null = null;

  function trustedLogin(): Promise<string> {
    if (options.authorLogin) return Promise.resolve(options.authorLogin);
    login ??= octokit.rest.users.getAuthenticated().then(
      ({ data }) => data.login,
      (error: unknown) => {
        login = null;
        throw new Error(
          'Could not resolve the GitHub user behind the token (GET /user). For GitHub App tokens, pass authorLogin: "<app-slug>[bot]".',
          { cause: error },
        );
      },
    );
    return login;
  }

  async function threadNumbers(branch: string, author: string): Promise<number[]> {
    const [pull, issues] = await Promise.all([
      findPullRequest(octokit, ref, branch),
      findFallbackIssues(octokit, ref, branch, author),
    ]);
    return pull === null ? issues : [pull, ...issues];
  }

  async function fetchPins(branch: string): Promise<StoredPin[]> {
    const author = await trustedLogin();
    const numbers = await threadNumbers(branch, author);
    const threads = await Promise.all(
      numbers.map((issue_number) =>
        octokit.paginate(octokit.rest.issues.listComments, {
          ...ref,
          issue_number,
          per_page: 100,
        }),
      ),
    );
    return threads
      .flat()
      .flatMap((comment) => {
        if (comment.user?.login !== author) return [];
        const pin = decodePinComment(comment.body ?? "");
        return pin && pin.branch === branch ? [{ pin, commentId: comment.id }] : [];
      })
      .sort(byCreatedAt);
  }

  async function loadPins(branch: string, fresh = false): Promise<StoredPin[]> {
    const cached = fresh ? undefined : cache.get(branch);
    if (cached) return cached;
    const pins = await fetchPins(branch);
    cache.set(branch, pins);
    return pins;
  }

  async function locate(branch: string, pinId: string): Promise<StoredPin> {
    const match = (pins: StoredPin[]) => pins.find(({ pin }) => pin.id === pinId);
    const found = match(await loadPins(branch)) ?? match(await loadPins(branch, true));
    if (!found) throw new PinNotFoundError(pinId);
    return found;
  }

  async function threadForNewPin(branch: string): Promise<number> {
    const pull = await findPullRequest(octokit, ref, branch);
    if (pull !== null) return pull;
    const [existing] = await findFallbackIssues(octokit, ref, branch, await trustedLogin());
    return existing ?? createFallbackIssue(octokit, ref, branch);
  }

  /** Re-reads the comment before editing so a stale cache never overwrites newer replies. */
  async function update(branch: string, pinId: string, change: (pin: Pin) => Pin): Promise<Pin> {
    const { commentId } = await locate(branch, pinId);
    const { data } = await octokit.rest.issues.getComment({ ...ref, comment_id: commentId });
    const current =
      data.user?.login === (await trustedLogin()) ? decodePinComment(data.body ?? "") : null;
    if (!current || current.id !== pinId) throw new PinNotFoundError(pinId);

    const next = change(current);
    if (next !== current) {
      await octokit.rest.issues.updateComment({
        ...ref,
        comment_id: commentId,
        body: encodePinComment(next),
      });
      cache.delete(branch);
    }
    return next;
  }

  return {
    async listPins({ branch, path }) {
      return (await loadPins(branch)).filter(({ pin }) => pin.path === path).map(({ pin }) => pin);
    },

    async createPin({ screenshot, ...draft }: PinDraft) {
      const issue_number = await threadForNewPin(draft.branch);
      const screenshotUrl =
        screenshot && screenshots
          ? await screenshots.save({ branch: draft.branch, pinId: draft.id, screenshot })
          : null;
      const pin: Pin = { ...draft, screenshotUrl };
      await octokit.rest.issues.createComment({
        ...ref,
        issue_number,
        body: encodePinComment(pin),
      });
      cache.delete(draft.branch);
      return pin;
    },

    addReply({ branch, pinId, reply }) {
      return update(branch, pinId, (pin) => ({ ...pin, replies: [...pin.replies, reply] }));
    },

    resolvePin({ branch, pinId, resolvedBy, resolvedAt }) {
      return update(branch, pinId, (pin) =>
        pin.resolved ? pin : { ...pin, resolved: true, resolvedAt, resolvedBy },
      );
    },

    /** See `expireGitHubPins`: deletes old pin comments and screenshots, closes emptied issues. */
    async expire(cutoff, deadline = Infinity) {
      const context = {
        octokit,
        ref,
        author: await trustedLogin(),
        screenshots,
        now,
        pause: () => new Promise<void>((resolve) => setTimeout(resolve, writeIntervalMs)),
        forget: (branch: string) => cache.delete(branch),
      };
      return expireGitHubPins(context, cutoff, deadline);
    },
  };
}
