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
});
