import type { Octokit } from "@octokit/rest";
import { vi } from "vitest";

interface FakeIssue {
  number: number;
  title: string;
  creator: string;
  isPull: boolean;
  head?: string;
  /** Missing means open. */
  state?: "open" | "closed";
  /** ISO time; missing means long ago. */
  created_at?: string;
}

interface FakeComment {
  id: number;
  issue_number: number;
  body: string;
  login: string;
  /** ISO time; missing means long ago. */
  created_at?: string;
}

const LONG_AGO = "2020-01-01T00:00:00.000Z";

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
  /** Files in each tree, by tree sha: path to blob sha. Unknown trees are empty. */
  trees: Map<string, Map<string, string>>;
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
    trees: new Map(),
    refConflicts: 0,
    ...initial,
  };
  let sequence = 100;
  const next = () => (sequence += 1);
  const commentView = (comment: FakeComment) => ({
    id: comment.id,
    body: comment.body,
    user: { login: comment.login },
    created_at: comment.created_at ?? LONG_AGO,
    issue_url: `https://api.github.com/repos/owner/site/issues/${comment.issue_number}`,
  });
  const isOpen = (issue: FakeIssue) => (issue.state ?? "open") === "open";
  const createdAt = (issue: FakeIssue) => issue.created_at ?? LONG_AGO;
  const issueView = (issue: FakeIssue) => ({
    number: issue.number,
    title: issue.title,
    state: issue.state ?? "open",
    created_at: createdAt(issue),
    pull_request: issue.isPull ? {} : undefined,
  });

  /**
   * `GET /search/issues` for the qualifiers pinpoint sends: `repo:`, `is:pr`,
   * `commenter:` (`app/<slug>` meaning `<slug>[bot]`) and `created:<=<day>`.
   * Any other term fails the test rather than being ignored.
   */
  function searchIssues({ q, per_page, page }: { q: string; per_page: number; page: number }) {
    let pullsOnly = false;
    let commenter: string | null = null;
    let latestDay: string | null = null;
    for (const term of q.split(" ")) {
      if (term === "repo:owner/site") continue;
      if (term === "is:pr") pullsOnly = true;
      else if (term.startsWith("commenter:")) {
        commenter = term.slice("commenter:".length).replace(/^app\/(.+)$/, "$1[bot]");
      } else if (term.startsWith("created:<=")) latestDay = term.slice("created:<=".length);
      else throw new Error(`Unexpected search term: ${term}`);
    }
    const matches = state.issues
      .filter((issue) => !pullsOnly || issue.isPull)
      .filter((issue) => latestDay === null || createdAt(issue).slice(0, 10) <= latestDay)
      .filter((issue) =>
        state.comments.some((c) => c.issue_number === issue.number && c.login === commenter),
      )
      .sort((a, b) => createdAt(a).localeCompare(createdAt(b)) || a.number - b.number);
    const start = (page - 1) * per_page;
    return Promise.resolve({
      data: {
        total_count: matches.length,
        incomplete_results: false,
        items: matches.slice(start, start + per_page).map(issueView),
      },
    });
  }

  const rest = {
    users: {
      getAuthenticated: vi.fn(() => Promise.resolve({ data: { login: state.login } })),
    },
    search: {
      issuesAndPullRequests: vi.fn(searchIssues),
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
      listForRepo: vi.fn(({ creator, state: wanted }: { creator: string; state?: string }) =>
        Promise.resolve({
          data: state.issues
            .filter((issue) => issue.creator === creator)
            .filter((issue) => wanted !== "open" || isOpen(issue))
            .map(issueView),
        }),
      ),
      update: vi.fn(({ issue_number, state: next }: { issue_number: number; state: string }) => {
        const issue = state.issues.find((entry) => entry.number === issue_number);
        if (!issue) return Promise.reject(httpError(404, "Not Found"));
        issue.state = next === "closed" ? "closed" : "open";
        return Promise.resolve({ data: {} });
      }),
      deleteComment: vi.fn(({ comment_id }: { comment_id: number }) => {
        const index = state.comments.findIndex((c) => c.id === comment_id);
        if (index === -1) return Promise.reject(httpError(404, "Not Found"));
        state.comments.splice(index, 1);
        return Promise.resolve({ data: {} });
      }),
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
        const created_at = new Date().toISOString();
        const comment = { id: next(), issue_number, body, login: state.login, created_at };
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
      createTree: vi.fn(
        ({
          base_tree,
          tree,
        }: {
          base_tree?: string;
          tree: Array<{ path: string; sha: string | null }>;
        }) => {
          const files = new Map(base_tree ? state.trees.get(base_tree) : undefined);
          for (const entry of tree) {
            if (entry.sha === null) files.delete(entry.path);
            else files.set(entry.path, entry.sha);
          }
          const sha = `tree-${next()}`;
          state.trees.set(sha, files);
          return Promise.resolve({ data: { sha } });
        },
      ),
      getTree: vi.fn(({ tree_sha }: { tree_sha: string }) => {
        const files = [...(state.trees.get(tree_sha) ?? new Map<string, string>())];
        return Promise.resolve({
          data: {
            tree: files.map(([path, sha]) => ({ path, sha, type: "blob" })),
            truncated: false,
          },
        });
      }),
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
