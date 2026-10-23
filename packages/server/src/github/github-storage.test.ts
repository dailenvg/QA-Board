import { describe, expect, it } from "vitest";
import { addComment, createFakeGitHub } from "../../test/fake-octokit";
import { draft, pin, PNG_BYTES } from "../../test/fixtures";
import { PinNotFoundError } from "../storage";
import { encodePinComment } from "./codec";
import { createGitHubStorage } from "./github-storage";

const scope = { branch: "feature/x", path: "/pricing" };
const reply = { id: "r1", author: "Bo", body: "On it", createdAt: "2026-10-23T11:00:00.000Z" };

function setup(initial: Parameters<typeof createFakeGitHub>[0] = {}) {
  let now = 0;
  const github = createFakeGitHub(initial);
  const storage = createGitHubStorage({
    repo: "owner/site",
    octokit: github.octokit,
    now: () => now,
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
