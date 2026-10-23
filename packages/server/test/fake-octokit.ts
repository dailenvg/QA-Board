import type { Octokit } from "@octokit/rest";
import { vi } from "vitest";

interface FakeIssue {
  number: number;
  title: string;
  creator: string;
  isPull: boolean;
  head?: string;
}

interface FakeComment {
  id: number;
  issue_number: number;
  body: string;
  login: string;
}

interface FakeCommit {
  sha: string;
  tree: string;
  parents: string[];
}

export interface FakeGitHubState {
  login: string;
  issues: FakeIssue[];
  comments: FakeComment[];
  refs: Map<string, string>;
  commits: Map<string, FakeCommit>;
  /** Number of upcoming updateRef calls that fail as a non-fast-forward. */
  refConflicts: number;
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

/** In-memory stand-in for the parts of the GitHub REST API pinpoint uses. */
export function createFakeGitHub(initial: Partial<FakeGitHubState> = {}) {
  const state: FakeGitHubState = {
    login: "pinpoint-bot",
    issues: [],
    comments: [],
    refs: new Map(),
    commits: new Map(),
    refConflicts: 0,
    ...initial,
  };
  let sequence = 100;
  const next = () => (sequence += 1);
  const commentView = (comment: FakeComment) => ({
    id: comment.id,
    body: comment.body,
    user: { login: comment.login },
  });

  const rest = {
    users: {
      getAuthenticated: vi.fn(() => Promise.resolve({ data: { login: state.login } })),
    },
    pulls: {
      list: vi.fn(({ head }: { head: string }) =>
        Promise.resolve({
          data: state.issues
            .filter((issue) => issue.isPull && `owner:${issue.head}` === head)
            .map(({ number }) => ({ number })),
        }),
      ),
    },
    issues: {
      listForRepo: vi.fn(({ creator }: { creator: string }) =>
        Promise.resolve({
          data: state.issues
            .filter((issue) => issue.creator === creator)
            .map((issue) => ({
              number: issue.number,
              title: issue.title,
              pull_request: issue.isPull ? {} : undefined,
            })),
        }),
      ),
      create: vi.fn(({ title }: { title: string }) => {
        const issue = { number: next(), title, creator: state.login, isPull: false };
        state.issues.push(issue);
        return Promise.resolve({ data: { number: issue.number } });
      }),
      listComments: vi.fn(({ issue_number }: { issue_number: number }) =>
        Promise.resolve({
          data: state.comments.filter((c) => c.issue_number === issue_number).map(commentView),
        }),
      ),
      createComment: vi.fn(({ issue_number, body }: { issue_number: number; body: string }) => {
        const comment = { id: next(), issue_number, body, login: state.login };
        state.comments.push(comment);
        return Promise.resolve({ data: commentView(comment) });
      }),
      getComment: vi.fn(({ comment_id }: { comment_id: number }) => {
        const comment = state.comments.find((c) => c.id === comment_id);
        return comment
          ? Promise.resolve({ data: commentView(comment) })
          : Promise.reject(httpError(404, "Not Found"));
      }),
      updateComment: vi.fn(({ comment_id, body }: { comment_id: number; body: string }) => {
        const comment = state.comments.find((c) => c.id === comment_id);
        if (!comment) return Promise.reject(httpError(404, "Not Found"));
        comment.body = body;
        return Promise.resolve({ data: commentView(comment) });
      }),
    },
    git: {
      getRef: vi.fn(({ ref }: { ref: string }) => {
        const sha = state.refs.get(ref);
        return sha
          ? Promise.resolve({ data: { object: { sha } } })
          : Promise.reject(httpError(404, "Not Found"));
      }),
      getCommit: vi.fn(({ commit_sha }: { commit_sha: string }) => {
        const commit = state.commits.get(commit_sha);
        return commit
          ? Promise.resolve({ data: { sha: commit.sha, tree: { sha: commit.tree } } })
          : Promise.reject(httpError(404, "Not Found"));
      }),
      createBlob: vi.fn(() => Promise.resolve({ data: { sha: `blob-${next()}` } })),
      createTree: vi.fn(() => Promise.resolve({ data: { sha: `tree-${next()}` } })),
      createCommit: vi.fn(({ tree, parents }: { tree: string; parents: string[] }) => {
        const commit = { sha: `commit-${next()}`, tree, parents };
        state.commits.set(commit.sha, commit);
        return Promise.resolve({ data: { sha: commit.sha } });
      }),
      updateRef: vi.fn(({ ref, sha }: { ref: string; sha: string }) => {
        if (state.refConflicts > 0) {
          state.refConflicts -= 1;
          return Promise.reject(httpError(422, "Update is not a fast forward"));
        }
        state.refs.set(ref, sha);
        return Promise.resolve({ data: {} });
      }),
      createRef: vi.fn(({ ref, sha }: { ref: string; sha: string }) => {
        const key = ref.replace(/^refs\//, "");
        if (state.refs.has(key)) return Promise.reject(httpError(422, "Reference already exists"));
        state.refs.set(key, sha);
        return Promise.resolve({ data: {} });
      }),
    },
  };

  const paginate = vi.fn(
    async <P>(method: (params: P) => Promise<{ data: unknown[] }>, params: P) =>
      (await method(params)).data,
  );

  const fake = { rest, paginate };
  return { state, rest, paginate, octokit: fake as unknown as Octokit };
}

export function addComment(
  state: FakeGitHubState,
  comment: Omit<FakeComment, "id"> & { id?: number },
): void {
  state.comments.push({ ...comment, id: comment.id ?? 900 + state.comments.length });
}
