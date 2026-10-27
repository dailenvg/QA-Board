import { describe, expect, it } from "vitest";
import { createFakeGitHub } from "../../test/fake-octokit";
import { PNG_BYTES } from "../../test/fixtures";
import { createGitBranchScreenshotStore } from "./git-branch-screenshot-store";

const screenshot = { contentType: "image/png" as const, data: PNG_BYTES };

describe("createGitBranchScreenshotStore", () => {
  it("creates the orphan branch with a parentless commit on first use", async () => {
    const github = createFakeGitHub();
    const store = createGitBranchScreenshotStore({
      octokit: github.octokit,
      owner: "owner",
      repo: "site",
    });

    const url = await store.save({ branch: "Feature/X", pinId: "pin-1", screenshot });

    expect(url).toBe(
      "https://github.com/owner/site/blob/pinpoint-assets/feature-x/pin-1.png?raw=true",
    );
    expect(github.rest.git.createBlob).toHaveBeenCalledWith(
      expect.objectContaining({
        encoding: "base64",
        content: Buffer.from(PNG_BYTES).toString("base64"),
      }),
    );
    expect(github.rest.git.createTree).toHaveBeenCalledWith(
      expect.not.objectContaining({ base_tree: expect.anything() as unknown }),
    );
    expect(github.rest.git.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({ parents: [] }),
    );
    expect(github.rest.git.createRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "refs/heads/pinpoint-assets" }),
    );
    expect(github.state.refs.has("heads/pinpoint-assets")).toBe(true);
  });

  it("appends to an existing branch on top of its tree", async () => {
    const github = createFakeGitHub();
    const store = createGitBranchScreenshotStore({
      octokit: github.octokit,
      owner: "owner",
      repo: "site",
    });
    await store.save({ branch: "main", pinId: "a", screenshot });
    const head = github.state.refs.get("heads/pinpoint-assets");

    await store.save({ branch: "main", pinId: "b", screenshot });

    expect(github.rest.git.createTree).toHaveBeenLastCalledWith(
      expect.objectContaining({ base_tree: github.state.commits.get(head ?? "")?.tree }),
    );
    expect(github.rest.git.createCommit).toHaveBeenLastCalledWith(
      expect.objectContaining({ parents: [head] }),
    );
    expect(github.rest.git.updateRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "heads/pinpoint-assets", force: false }),
    );
  });

  it("retries when the ref moved (non-fast-forward)", async () => {
    const github = createFakeGitHub();
    const store = createGitBranchScreenshotStore({
      octokit: github.octokit,
      owner: "owner",
      repo: "site",
    });
    await store.save({ branch: "main", pinId: "a", screenshot });
    github.state.refConflicts = 2;

    await store.save({ branch: "main", pinId: "b", screenshot });

    expect(github.rest.git.updateRef).toHaveBeenCalledTimes(3);
    expect(github.rest.git.createBlob).toHaveBeenCalledTimes(2);
  });

  it("gives up after maxAttempts", async () => {
    const github = createFakeGitHub();
    const store = createGitBranchScreenshotStore({
      octokit: github.octokit,
      owner: "owner",
      repo: "site",
      maxAttempts: 2,
    });
    await store.save({ branch: "main", pinId: "a", screenshot });
    github.state.refConflicts = 5;

    await expect(store.save({ branch: "main", pinId: "b", screenshot })).rejects.toMatchObject({
      status: 422,
    });
  });

  it("retries when another writer created the orphan branch first", async () => {
    const github = createFakeGitHub();
    github.rest.git.getRef.mockRejectedValueOnce(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );
    github.state.refs.set("heads/pinpoint-assets", "commit-existing");
    github.state.commits.set("commit-existing", {
      sha: "commit-existing",
      tree: "tree-0",
      parents: [],
    });
    const store = createGitBranchScreenshotStore({
      octokit: github.octokit,
      owner: "owner",
      repo: "site",
    });

    await store.save({ branch: "main", pinId: "a", screenshot });

    expect(github.rest.git.createRef).toHaveBeenCalledOnce();
    expect(github.rest.git.updateRef).toHaveBeenCalledOnce();
  });

  it("removes the files it saved for the given pins in one commit, and nothing else", async () => {
    const github = createFakeGitHub();
    const store = createGitBranchScreenshotStore({
      octokit: github.octokit,
      owner: "owner",
      repo: "site",
    });
    const a = await store.save({ branch: "main", pinId: "a", screenshot });
    const b = await store.save({ branch: "main", pinId: "b", screenshot });
    const files = () => {
      const head = github.state.refs.get("heads/pinpoint-assets") ?? "";
      const tree = github.state.commits.get(head)?.tree ?? "";
      return [...(github.state.trees.get(tree)?.keys() ?? [])].sort();
    };
    expect(files()).toEqual(["main/a.png", "main/b.png"]);
    const commits = github.rest.git.createCommit.mock.calls.length;

    const removed = await store.remove?.([
      { branch: "main", pinId: "a", url: a },
      // Another pin's URL: not what this store would have made for pin "c".
      { branch: "main", pinId: "c", url: b },
      { branch: "main", pinId: "b", url: "https://example.com/main/b.png" },
      { branch: "main", pinId: "gone", url: a.replace("/a.png", "/gone.png") },
    ]);

    expect(removed).toBe(1);
    expect(files()).toEqual(["main/b.png"]);
    expect(github.rest.git.createCommit).toHaveBeenCalledTimes(commits + 1);
    expect(github.rest.git.createTree).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tree: [{ path: "main/a.png", mode: "100644", type: "blob", sha: null }],
      }),
    );
  });

  it("commits nothing when none of the files are there, or the branch isn't", async () => {
    const github = createFakeGitHub();
    const store = createGitBranchScreenshotStore({
      octokit: github.octokit,
      owner: "owner",
      repo: "site",
    });
    const url = "https://github.com/owner/site/blob/pinpoint-assets/main/a.png?raw=true";
    expect(await store.remove?.([{ branch: "main", pinId: "a", url }])).toBe(0);
    await store.save({ branch: "main", pinId: "b", screenshot });
    expect(await store.remove?.([{ branch: "main", pinId: "a", url }])).toBe(0);
    expect(github.rest.git.createCommit).toHaveBeenCalledOnce();
  });

  it("retries a removal when the ref moved", async () => {
    const github = createFakeGitHub();
    const store = createGitBranchScreenshotStore({
      octokit: github.octokit,
      owner: "owner",
      repo: "site",
    });
    const url = await store.save({ branch: "main", pinId: "a", screenshot });
    github.state.refConflicts = 1;

    expect(await store.remove?.([{ branch: "main", pinId: "a", url }])).toBe(1);
    expect(github.rest.git.updateRef).toHaveBeenCalledTimes(2);
  });
});
