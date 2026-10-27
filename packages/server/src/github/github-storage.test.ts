import { afterEach, describe, expect, it, vi } from "vitest";
import { addComment, createFakeGitHub, type FakeGitHubState } from "../../test/fake-octokit";
import { draft, pin, PNG_BYTES } from "../../test/fixtures";
import { PinNotFoundError } from "../storage";
import { encodePinComment } from "./codec";
import { MAX_PINS_PER_RUN } from "./expiry";
import { createGitHubStorage, type GitHubStorageOptions } from "./github-storage";

const scope = { branch: "feature/x", path: "/pricing" };
const reply = { id: "r1", author: "Bo", body: "On it", createdAt: "2026-10-23T11:00:00.000Z" };

function setup(
  initial: Parameters<typeof createFakeGitHub>[0] = {},
  options: Partial<GitHubStorageOptions> = {},
) {
  let now = 0;
  const github = createFakeGitHub(initial);
  const storage = createGitHubStorage({
    repo: "owner/site",
    octokit: github.octokit,
    now: () => now,
    writeIntervalMs: 0,
    ...options,
  });
  return {
    github,
    storage,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const openPull = { number: 7, title: "Feature X", creator: "dev", isPull: true, head: "feature/x" };

describe("createGitHubStorage", () => {
  it("posts new pins as comments on the open PR for the branch", async () => {
    const { github, storage } = setup({ issues: [openPull] });

    const created = await storage.createPin(draft());

    expect(github.rest.pulls.list).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "owner",
        repo: "site",
        state: "open",
        head: "owner:feature/x",
      }),
    );
    expect(github.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 7, body: encodePinComment(created) }),
    );
    expect(github.rest.issues.create).not.toHaveBeenCalled();
    expect(await storage.listPins(scope)).toEqual([created]);
  });

  it("falls back to a [pinpoint] issue, creating it once and reusing it", async () => {
    const { github, storage } = setup();

    await storage.createPin(draft({ id: "a" }));
    await storage.createPin(draft({ id: "b" }));

    expect(github.rest.issues.create).toHaveBeenCalledOnce();
    expect(github.rest.issues.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "[pinpoint] feature/x" }),
    );
    const issueNumber = github.state.issues[0]?.number;
    expect(github.state.comments.every((c) => c.issue_number === issueNumber)).toBe(true);
    expect((await storage.listPins(scope)).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("only trusts the fallback issue when its creator is the token's user", async () => {
    const { github, storage } = setup({
      issues: [{ number: 3, title: "[pinpoint] feature/x", creator: "mallory", isPull: false }],
    });
    await storage.createPin(draft());
    expect(github.rest.issues.create).toHaveBeenCalledOnce();
    expect(github.rest.issues.listForRepo).toHaveBeenCalledWith(
      expect.objectContaining({ creator: "pinpoint-bot" }),
    );
  });

  it("reads pins from both the PR and an earlier fallback issue", async () => {
    const { github, storage } = setup({
      issues: [
        openPull,
        { number: 3, title: "[pinpoint] feature/x", creator: "pinpoint-bot", isPull: false },
      ],
    });
    addComment(github.state, {
      issue_number: 3,
      login: "pinpoint-bot",
      body: encodePinComment(pin({ id: "old", createdAt: "2026-10-01T00:00:00.000Z" })),
    });
    addComment(github.state, {
      issue_number: 7,
      login: "pinpoint-bot",
      body: encodePinComment(pin({ id: "new" })),
    });

    expect((await storage.listPins(scope)).map((p) => p.id)).toEqual(["old", "new"]);
  });

  it("ignores pinpoint blocks in comments by other users or bots", async () => {
    const { github, storage } = setup({ issues: [openPull] });
    addComment(github.state, {
      issue_number: 7,
      login: "mallory",
      body: encodePinComment(pin({ id: "forged" })),
    });
    addComment(github.state, {
      issue_number: 7,
      login: "other[bot]",
      body: encodePinComment(pin({ id: "bot" })),
    });
    addComment(github.state, {
      issue_number: 7,
      login: "pinpoint-bot",
      body: encodePinComment(pin({ id: "real" })),
    });

    expect((await storage.listPins(scope)).map((p) => p.id)).toEqual(["real"]);
    await expect(
      storage.resolvePin({
        ...scope,
        pinId: "forged",
        resolvedBy: "x",
        resolvedAt: reply.createdAt,
      }),
    ).rejects.toBeInstanceOf(PinNotFoundError);
  });

  it("resolves the trusted login once via GET /user, or uses authorLogin", async () => {
    const { github, storage } = setup({ issues: [openPull] });
    await storage.listPins(scope);
    await storage.listPins({ ...scope, path: "/other" });
    await storage.createPin(draft());
    await storage.listPins(scope);
    expect(github.rest.users.getAuthenticated).toHaveBeenCalledOnce();

    const app = createFakeGitHub({ issues: [openPull], login: "ignored" });
    addComment(app.state, { issue_number: 7, login: "my-app[bot]", body: encodePinComment(pin()) });
    const appStorage = createGitHubStorage({
      repo: "owner/site",
      octokit: app.octokit,
      authorLogin: "my-app[bot]",
    });
    expect(await appStorage.listPins(scope)).toHaveLength(1);
    expect(app.rest.users.getAuthenticated).not.toHaveBeenCalled();
  });

  it("caches reads for 15 s and refetches after", async () => {
    const { github, storage, advance } = setup({ issues: [openPull] });
    await storage.listPins(scope);
    advance(14_999);
    await storage.listPins(scope);
    expect(github.paginate).toHaveBeenCalledTimes(2);

    advance(2);
    await storage.listPins(scope);
    expect(github.paginate).toHaveBeenCalledTimes(4);
  });

  it("invalidates the cache on writes", async () => {
    const { github, storage } = setup({ issues: [openPull] });
    expect(await storage.listPins(scope)).toHaveLength(0);
    await storage.createPin(draft());
    expect(await storage.listPins(scope)).toHaveLength(1);

    await storage.addReply({ ...scope, pinId: "pin-1", reply });
    expect((await storage.listPins(scope))[0]?.replies).toEqual([reply]);
    expect(github.rest.issues.updateComment).toHaveBeenCalledOnce();
  });

  it("appends replies and resolves by editing the same comment", async () => {
    const { github, storage } = setup({ issues: [openPull] });
    await storage.createPin(draft());
    const commentId = github.state.comments[0]?.id;

    const replied = await storage.addReply({ ...scope, pinId: "pin-1", reply });
    const resolved = await storage.resolvePin({
      ...scope,
      pinId: "pin-1",
      resolvedBy: "Bo",
      resolvedAt: "2026-10-24T09:00:00.000Z",
    });

    expect(replied.replies).toEqual([reply]);
    expect(resolved).toMatchObject({ resolved: true, resolvedBy: "Bo", replies: [reply] });
    expect(github.state.comments).toHaveLength(1);
    expect(github.state.comments[0]?.id).toBe(commentId);
    expect(github.state.comments[0]?.body).toContain("### ✅ Pinpoint comment");
  });

  it("finds a pin created by another instance even when its cache is warm", async () => {
    const { github, storage } = setup({ issues: [openPull] });
    await storage.listPins(scope);
    addComment(github.state, {
      issue_number: 7,
      login: "pinpoint-bot",
      body: encodePinComment(pin({ id: "elsewhere" })),
    });

    const updated = await storage.addReply({ ...scope, pinId: "elsewhere", reply });
    expect(updated.replies).toHaveLength(1);
  });

  it("uploads screenshots to the assets branch and links them", async () => {
    const { github, storage } = setup({ issues: [openPull] });
    const created = await storage.createPin(
      draft({ screenshot: { contentType: "image/png", data: PNG_BYTES } }),
    );

    expect(created.screenshotUrl).toBe(
      "https://github.com/owner/site/blob/pinpoint-assets/feature-x/pin-1.png?raw=true",
    );
    expect(github.state.refs.has("heads/pinpoint-assets")).toBe(true);
    expect(github.state.comments[0]?.body).toContain(
      `![Screenshot of the page](${created.screenshotUrl})`,
    );
  });

  it("validates its configuration", () => {
    expect(() => createGitHubStorage({ repo: "not-a-repo", token: "t" })).toThrow(/owner\/name/);
    expect(() => createGitHubStorage({ repo: "owner/site" })).toThrow(/token/);
  });
});

describe("createGitHubStorage: expire", () => {
  const CUTOFF = Date.parse("2026-09-27T00:00:00.000Z");
  const OLD = "2026-09-01T10:00:00.000Z";
  const YOUNG = "2026-10-20T10:00:00.000Z";
  const fallback = (number: number, extra: Partial<FakeGitHubState["issues"][number]> = {}) => ({
    number,
    title: `[pinpoint] feature/${number}`,
    creator: "pinpoint-bot",
    isPull: false,
    created_at: "2026-08-01T00:00:00.000Z",
    ...extra,
  });

  /** A pin comment by pinpoint, posted when the pin was created. */
  function pinComment(
    state: FakeGitHubState,
    issue: number,
    id: string,
    createdAt: string,
    extra: Partial<ReturnType<typeof pin>> = {},
  ) {
    addComment(state, {
      issue_number: issue,
      login: "pinpoint-bot",
      body: encodePinComment(pin({ id, createdAt, ...extra })),
      created_at: createdAt,
    });
  }

  const ids = (state: FakeGitHubState) => state.comments.map((comment) => comment.id);

  afterEach(() => {
    vi.useRealTimers();
  });

  it("deletes only pinpoint's own pin comments created by the cutoff", async () => {
    const { github, storage } = setup({ issues: [openPull] });
    pinComment(github.state, 7, "old", OLD);
    pinComment(github.state, 7, "edge", new Date(CUTOFF).toISOString());
    pinComment(github.state, 7, "fresh", new Date(CUTOFF + 1).toISOString());
    pinComment(github.state, 7, "young", YOUNG);
    const human = { issue_number: 7, created_at: OLD };
    addComment(github.state, { ...human, id: 1, login: "dev", body: "Looks good" });
    addComment(github.state, {
      ...human,
      id: 2,
      login: "mallory",
      body: encodePinComment(pin({ id: "forged", createdAt: OLD })),
    });
    addComment(github.state, { ...human, id: 3, login: "pinpoint-bot", body: "Not a pin" });
    expect(await storage.listPins(scope)).toHaveLength(4);

    expect(await storage.expire?.(CUTOFF)).toEqual({ expired: 2, done: true });

    expect(ids(github.state)).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(github.state.comments).toHaveLength(5);
    // The read cache forgot the branch.
    expect((await storage.listPins(scope)).map((p) => p.id)).toEqual(["fresh", "young"]);
  });

  it("deletes expired pins' screenshots from the assets branch, and no other file", async () => {
    const { github, storage } = setup({ issues: [openPull] });
    const shot = { contentType: "image/png" as const, data: PNG_BYTES };
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse(OLD));
    const old = await storage.createPin(draft({ id: "old", createdAt: OLD, screenshot: shot }));
    vi.setSystemTime(Date.parse(YOUNG));
    await storage.createPin(draft({ id: "young", createdAt: YOUNG, screenshot: shot }));
    vi.useRealTimers();
    // A pin whose screenshot isn't pinpoint's file, and a file pinpoint didn't put there.
    pinComment(github.state, 7, "elsewhere", OLD, {
      screenshotUrl: "https://github.com/owner/site/blob/pinpoint-assets/README.md?raw=true",
    });
    const head = github.state.refs.get("heads/pinpoint-assets") ?? "";
    const tree = github.state.commits.get(head)?.tree ?? "";
    github.state.trees.get(tree)?.set("README.md", "blob-readme");

    expect(await storage.expire?.(CUTOFF)).toEqual({ expired: 2, done: true });

    const files = () => {
      const sha = github.state.refs.get("heads/pinpoint-assets") ?? "";
      return [...(github.state.trees.get(github.state.commits.get(sha)?.tree ?? "")?.keys() ?? [])];
    };
    expect(old.screenshotUrl).toContain("feature-x/old.png");
    expect(files().sort()).toEqual(["README.md", "feature-x/young.png"]);
    expect(github.rest.git.createCommit).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: "pinpoint: remove expired screenshots" }),
    );

    // Nothing left to remove: no empty commit.
    const commits = github.rest.git.createCommit.mock.calls.length;
    expect(await storage.expire?.(CUTOFF)).toEqual({ expired: 0, done: true });
    expect(github.rest.git.createCommit).toHaveBeenCalledTimes(commits);
  });

  it("closes pinpoint's fallback issues left without pins, and nothing else", async () => {
    const { github, storage } = setup({
      issues: [
        fallback(3),
        fallback(4),
        fallback(5, { created_at: YOUNG }),
        fallback(6, { creator: "dev" }),
        fallback(8, { title: "Release checklist" }),
        { ...openPull, creator: "pinpoint-bot", created_at: OLD },
      ],
    });
    pinComment(github.state, 3, "old", OLD);
    pinComment(github.state, 4, "old-too", OLD);
    pinComment(github.state, 4, "young", YOUNG);
    addComment(github.state, { issue_number: 3, login: "dev", body: "Thanks", created_at: OLD });

    expect(await storage.expire?.(CUTOFF)).toEqual({ expired: 2, done: true });

    const state = (number: number) =>
      github.state.issues.find((issue) => issue.number === number)?.state ?? "open";
    expect([3, 4, 5, 6, 7, 8].map(state)).toEqual([
      "closed",
      "open",
      // Too young: it may be about to get its first pin.
      "open",
      "open",
      "open",
      "open",
    ]);
    expect(github.rest.issues.update).toHaveBeenCalledOnce();
    // Closed, not deleted: the human's comment is still there.
    expect(github.state.comments.some((comment) => comment.body === "Thanks")).toBe(true);
  });

  it("reopens an issue a pin was posted to while it closed", async () => {
    const { github, storage } = setup({ issues: [fallback(3)] });
    const close = github.rest.issues.update.getMockImplementation();
    github.rest.issues.update.mockImplementationOnce((params) => {
      pinComment(github.state, 3, "racing", YOUNG);
      return close?.(params) ?? Promise.resolve({ data: {} });
    });

    expect(await storage.expire?.(CUTOFF)).toEqual({ expired: 0, done: true });

    expect(github.rest.issues.update.mock.calls.map(([params]) => params.state)).toEqual([
      "closed",
      "open",
    ]);
    expect(github.state.issues[0]?.state).toBe("open");
  });

  it("reads only pinpoint's threads: its issues and the pull requests it commented on", async () => {
    const pull = (number: number, created_at: string, state?: "closed") => ({
      number,
      title: `PR ${number}`,
      creator: "dev",
      isPull: true,
      created_at,
      ...(state ? { state } : {}),
    });
    const { github, storage } = setup({
      issues: [
        fallback(3),
        fallback(4, { state: "closed" }),
        fallback(5, { created_at: YOUNG }),
        openPull,
        pull(9, OLD, "closed"),
        pull(10, OLD),
        pull(11, YOUNG),
      ],
    });
    pinComment(github.state, 3, "on-issue", OLD);
    pinComment(github.state, 4, "on-closed-issue", OLD);
    pinComment(github.state, 7, "on-open-pull", OLD);
    pinComment(github.state, 9, "on-merged-pull", OLD);
    pinComment(github.state, 5, "on-young-issue", YOUNG);
    pinComment(github.state, 11, "on-young-pull", YOUNG);
    for (let index = 0; index < 250; index += 1) {
      addComment(github.state, { issue_number: 10, login: "dev", body: "Hi", created_at: OLD });
    }

    expect(await storage.expire?.(CUTOFF)).toEqual({ expired: 4, done: true });

    expect(github.rest.search.issuesAndPullRequests).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "repo:owner/site is:pr commenter:pinpoint-bot created:<=2026-09-28",
        sort: "created",
        order: "asc",
      }),
    );
    // Never the busy thread pinpoint wasn't on, nor threads too young for an expired pin.
    const read = github.rest.issues.listComments.mock.calls.map(([params]) => params.issue_number);
    expect([...new Set(read)].sort((a, b) => a - b)).toEqual([3, 4, 7, 9]);
    expect(github.state.comments.filter((c) => c.login === "pinpoint-bot")).toHaveLength(2);
    // The closed issue stays closed; the emptied open one is closed.
    expect(github.state.issues.slice(0, 2).map((issue) => issue.state)).toEqual([
      "closed",
      "closed",
    ]);
    expect(github.rest.issues.update).toHaveBeenCalledOnce();
  });

  it("searches for a GitHub App's comments as app/<slug>", async () => {
    const { github, storage } = setup({ issues: [openPull] }, { authorLogin: "my-app[bot]" });
    addComment(github.state, {
      issue_number: 7,
      login: "my-app[bot]",
      body: encodePinComment(pin({ id: "old", createdAt: OLD })),
      created_at: OLD,
    });

    expect(await storage.expire?.(CUTOFF)).toEqual({ expired: 1, done: true });
    const search = github.rest.search.issuesAndPullRequests.mock.calls[0]?.[0];
    expect(search?.q).toContain(" commenter:app/my-app ");
  });

  it("isn't done while search's results are partial", async () => {
    const { github, storage } = setup({ issues: [openPull] });
    pinComment(github.state, 7, "old", OLD);
    const search = github.rest.search.issuesAndPullRequests.getMockImplementation();
    github.rest.search.issuesAndPullRequests.mockImplementationOnce(async (params) => {
      const { data } = (await search?.(params)) ?? { data: { total_count: 0, items: [] } };
      return { data: { ...data, incomplete_results: true } };
    });

    expect(await storage.expire?.(CUTOFF)).toEqual({ expired: 1, done: false });
    expect(await storage.expire?.(CUTOFF)).toEqual({ expired: 0, done: true });
  });

  it("isn't done when there are more pull requests than search returns", async () => {
    const { github, storage } = setup();
    github.rest.search.issuesAndPullRequests.mockImplementation(({ page, per_page }) =>
      Promise.resolve({
        data: {
          total_count: 1_500,
          incomplete_results: false,
          items: Array.from({ length: per_page }, (_, index) => ({
            number: 1_000 + (page - 1) * per_page + index,
            title: "PR",
            state: "open",
            created_at: OLD,
            pull_request: {},
          })),
        },
      }),
    );

    expect(await storage.expire?.(CUTOFF)).toEqual({ expired: 0, done: false });
    // Search returns 1,000 results at most: ten pages of a hundred.
    expect(github.rest.search.issuesAndPullRequests).toHaveBeenCalledTimes(10);
  });

  it("stops at the search API's rate limit without failing", async () => {
    const { github, storage } = setup({ issues: [openPull] });
    pinComment(github.state, 7, "old", OLD);
    github.rest.search.issuesAndPullRequests.mockRejectedValueOnce(
      Object.assign(new Error("rate limited"), {
        status: 403,
        response: { headers: { "x-ratelimit-remaining": "0" } },
      }),
    );

    expect(await storage.expire?.(CUTOFF)).toEqual({ expired: 0, done: false });
    expect(await storage.expire?.(CUTOFF)).toEqual({ expired: 1, done: true });
  });

  it(`takes on at most ${MAX_PINS_PER_RUN} pins a run, and the next run goes on`, async () => {
    const { github, storage } = setup({ issues: [openPull] });
    for (let index = 0; index <= MAX_PINS_PER_RUN; index += 1) {
      pinComment(github.state, 7, `old-${index}`, OLD);
    }

    expect(await storage.expire?.(CUTOFF)).toEqual({ expired: MAX_PINS_PER_RUN, done: false });
    expect(await storage.expire?.(CUTOFF)).toEqual({ expired: 1, done: true });
    expect(github.state.comments).toHaveLength(0);
  });

  it("stops at the deadline, and the next run goes on", async () => {
    const { github, storage, advance } = setup({ issues: [openPull, fallback(3)] });
    pinComment(github.state, 7, "a", OLD);
    pinComment(github.state, 7, "b", OLD);
    const remove = github.rest.issues.deleteComment.getMockImplementation();
    github.rest.issues.deleteComment.mockImplementation((params) => {
      advance(1_000);
      return remove?.(params) ?? Promise.resolve({ data: {} });
    });

    expect(await storage.expire?.(CUTOFF, 1_000)).toEqual({ expired: 1, done: false });
    // Past the deadline, the empty issue isn't closed either.
    expect(github.rest.issues.update).not.toHaveBeenCalled();
    expect(await storage.expire?.(CUTOFF)).toEqual({ expired: 1, done: true });
    expect(github.state.issues[1]?.state).toBe("closed");
  });

  it("stops at a rate limit without failing, and throws anything else", async () => {
    const { github, storage } = setup({ issues: [openPull] });
    pinComment(github.state, 7, "a", OLD);
    pinComment(github.state, 7, "b", OLD);
    const limited = Object.assign(new Error("rate limited"), {
      status: 403,
      response: { headers: { "x-ratelimit-remaining": "0" } },
    });
    const remove = github.rest.issues.deleteComment.getMockImplementation();
    github.rest.issues.deleteComment
      .mockImplementationOnce((params) => remove?.(params) ?? Promise.resolve({ data: {} }))
      .mockRejectedValueOnce(limited);

    expect(await storage.expire?.(CUTOFF)).toEqual({ expired: 1, done: false });

    github.rest.issues.deleteComment.mockRejectedValueOnce(
      Object.assign(new Error("Forbidden"), { status: 403 }),
    );
    await expect(storage.expire?.(CUTOFF)).rejects.toMatchObject({ status: 403 });
  });

  it("waits a second between writes by default", async () => {
    vi.useFakeTimers();
    const { github, storage } = setup({ issues: [openPull] }, { writeIntervalMs: undefined });
    pinComment(github.state, 7, "a", OLD);
    pinComment(github.state, 7, "b", OLD);

    const run = storage.expire?.(CUTOFF);
    await vi.advanceTimersByTimeAsync(0);
    expect(github.rest.issues.deleteComment).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(github.rest.issues.deleteComment).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(github.rest.issues.deleteComment).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await run).toEqual({ expired: 2, done: true });
  });
});
