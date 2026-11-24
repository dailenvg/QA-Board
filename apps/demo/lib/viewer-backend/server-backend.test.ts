import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureFailed } from "../capture/messages";
import type { CaptureResult } from "../capture/request-capture";
import { CLIENT_CAPTURE_TIMEOUT_MS } from "../capture/use-capture";
import { CROP_ATTEMPTS } from "../crop/crop-retry";

const mocks = vi.hoisted(() => ({
  addComment: vi.fn(),
  addReply: vi.fn(),
  addSnapshot: vi.fn(),
  attachCrop: vi.fn(),
  emitSquiggy: vi.fn(),
  hasProject: vi.fn(),
  requestCapture: vi.fn(),
  storeWorkspaceBlob: vi.fn(),
}));

vi.mock("../store/actions", () => ({
  addComment: mocks.addComment,
  addReply: mocks.addReply,
  addSnapshot: mocks.addSnapshot,
  attachCrop: mocks.attachCrop,
  deleteComment: vi.fn(),
  deleteReply: vi.fn(),
  editComment: vi.fn(),
  editReply: vi.fn(),
  hasProject: mocks.hasProject,
  replaceWithImage: vi.fn(),
  restoreComment: vi.fn(),
  restoreReply: vi.fn(),
  setAuthorName: vi.fn(),
  setCommentStatus: vi.fn(),
}));
vi.mock("../workspace-client/blob-upload", () => ({
  storeWorkspaceBlob: mocks.storeWorkspaceBlob,
}));
vi.mock("../capture/request-capture", () => ({ requestCapture: mocks.requestCapture }));
vi.mock("../squiggy/events", () => ({ emitSquiggy: mocks.emitSquiggy }));

const { captureNewWebsite, serverBackend } = await import("./server-backend");
const { REPLY_NOT_SENT } = await import("./backend");
const { SAVE_FAILED } = await import("../workspace-client/mutations");

const input = { id: "c-1", projectId: "p1", x: 1, y: 2, body: "Fix", author: "Ana" };
const crop = {
  blob: new Blob(["jpeg"], { type: "image/jpeg" }),
  rect: { x: 0, y: 0, width: 4, height: 3 },
};

beforeEach(() => {
  vi.useFakeTimers();
  mocks.addComment.mockReturnValue({ ok: true, value: { ...input, status: "active" } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("the owner's comment screenshot", () => {
  it("is uploaded again after a failure, then attached", async () => {
    mocks.storeWorkspaceBlob
      .mockResolvedValueOnce({ ok: false, status: 503, error: "failed" })
      .mockResolvedValueOnce({ ok: true });
    expect((await serverBackend.addComment(input, crop)).ok).toBe(true);
    await vi.runAllTimersAsync();
    expect(mocks.storeWorkspaceBlob).toHaveBeenCalledTimes(2);
    expect(mocks.attachCrop).toHaveBeenCalledWith("c-1", { blobKey: "crop:c-1", rect: crop.rect });
  });

  it("stops after CROP_ATTEMPTS failed uploads, leaving the saved comment as it is", async () => {
    mocks.storeWorkspaceBlob.mockResolvedValue({ ok: false, status: 503, error: "failed" });
    await serverBackend.addComment(input, crop);
    await vi.runAllTimersAsync();
    expect(mocks.storeWorkspaceBlob).toHaveBeenCalledTimes(CROP_ATTEMPTS);
    expect(mocks.attachCrop).not.toHaveBeenCalled();
  });
});

describe("the owner's reply", () => {
  const reply = { id: "r-1", projectId: "p1", commentId: "c-1", body: "On it", author: "Ana" };

  it("resolves with the saved reply", async () => {
    const saved = { ...reply, createdAt: 1, mine: true };
    mocks.addReply.mockResolvedValue({ ok: true, value: saved });
    expect(await serverBackend.addReply(reply)).toEqual({ ok: true, value: saved });
  });

  it("says it wasn't sent, to retry, when the save failed for no reason more specific", async () => {
    mocks.addReply.mockResolvedValue({ ok: false, error: SAVE_FAILED });
    expect(await serverBackend.addReply(reply)).toEqual({ ok: false, error: REPLY_NOT_SENT });
  });

  it("passes a specific refusal through, which retrying won't fix", async () => {
    for (const error of [
      "This comment is no longer here. It may have been deleted in another tab.",
      "That change didn't save. Reload the page and try again.",
      "You can no longer reply here. Ask Olga if you need to.",
    ]) {
      mocks.addReply.mockResolvedValue({ ok: false, error });
      expect(await serverBackend.addReply(reply)).toEqual({ ok: false, error });
    }
  });
});

describe("a new website project's first snapshot", () => {
  const URL = "https://acme.example/";
  const captured: CaptureResult = {
    ok: true,
    blob: new Blob(["jpeg"], { type: "image/jpeg" }),
    width: 1440,
    height: 2400,
    scale: 1,
  };

  /** Holds the capture until the test lets it answer. */
  function slowCapture() {
    let answer!: (result: CaptureResult) => void;
    mocks.requestCapture.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    return (result: CaptureResult = captured) => answer(result);
  }

  beforeEach(() => {
    mocks.hasProject.mockReturnValue(true);
    mocks.storeWorkspaceBlob.mockResolvedValue({ ok: true });
    mocks.addSnapshot.mockImplementation((snapshot: object) => ({ ok: true, value: snapshot }));
  });

  it("is captured at Desktop's width, and the viewer joins it instead of starting another", async () => {
    const answer = slowCapture();
    captureNewWebsite("p-new", URL);
    expect(mocks.requestCapture).toHaveBeenCalledWith(URL, 1440, expect.any(AbortSignal));
    const joined = serverBackend.captureSnapshot("p-new", URL, 1440, new AbortController().signal);
    answer();
    expect(await joined).toMatchObject({ ok: true, snapshot: { projectId: "p-new", width: 1440 } });
    expect(mocks.requestCapture).toHaveBeenCalledTimes(1);
    expect(mocks.addSnapshot).toHaveBeenCalledTimes(1);
  });

  it("isn't joined at another breakpoint", async () => {
    slowCapture();
    captureNewWebsite("p-wide", URL);
    void serverBackend.captureSnapshot("p-wide", URL, 390, new AbortController().signal);
    await vi.waitFor(() => expect(mocks.requestCapture).toHaveBeenCalledTimes(2));
    expect(mocks.requestCapture).toHaveBeenLastCalledWith(URL, 390, expect.any(AbortSignal));
  });

  it("carries on when the viewer leaves, and lands in the workspace", async () => {
    const answer = slowCapture();
    captureNewWebsite("p-left", URL);
    const leaving = new AbortController();
    const joined = serverBackend.captureSnapshot("p-left", URL, 1440, leaving.signal);
    leaving.abort();
    expect(await joined).toBeNull();
    answer();
    await vi.waitFor(() => expect(mocks.addSnapshot).toHaveBeenCalledTimes(1));
  });

  it("fails as too slow when it never answers, for the viewer waiting on it", async () => {
    mocks.requestCapture.mockImplementation(
      (_url: string, _width: number, signal: AbortSignal) =>
        new Promise((resolve) =>
          signal.addEventListener("abort", () => resolve({ ok: false, failure: "offline" })),
        ),
    );
    captureNewWebsite("p-silent", URL);
    const joined = serverBackend.captureSnapshot(
      "p-silent",
      URL,
      1440,
      new AbortController().signal,
    );
    await vi.advanceTimersByTimeAsync(CLIENT_CAPTURE_TIMEOUT_MS);
    expect(await joined).toEqual(captureFailed("timeout"));
  });

  it("isn't uploaded once the project is deleted, and says nothing", async () => {
    const answer = slowCapture();
    captureNewWebsite("p-deleted", URL);
    mocks.hasProject.mockReturnValue(false);
    answer();
    await vi.runAllTimersAsync();
    expect(mocks.storeWorkspaceBlob).not.toHaveBeenCalled();
    expect(mocks.addSnapshot).not.toHaveBeenCalled();
    expect(mocks.emitSquiggy).not.toHaveBeenCalled();
  });

  it("says nothing when the server no longer has the project", async () => {
    mocks.requestCapture.mockResolvedValue(captured);
    mocks.storeWorkspaceBlob.mockResolvedValue({ ok: false, status: 404, error: "not-found" });
    captureNewWebsite("p-gone", URL);
    await vi.runAllTimersAsync();
    expect(mocks.storeWorkspaceBlob).toHaveBeenCalledTimes(1);
    expect(mocks.emitSquiggy).not.toHaveBeenCalled();
  });

  it("still tells Squiggy when its upload really fails", async () => {
    mocks.requestCapture.mockResolvedValue(captured);
    mocks.storeWorkspaceBlob.mockResolvedValue({ ok: false, status: 503, error: "failed" });
    captureNewWebsite("p-flaky", URL);
    await vi.runAllTimersAsync();
    expect(mocks.emitSquiggy).toHaveBeenCalledWith({ type: "save-failed" });
  });

  it("lands on a login page: saves nothing, says nothing, and the viewer hears why", async () => {
    const answer = slowCapture();
    captureNewWebsite("p-login", URL);
    const joined = serverBackend.captureSnapshot(
      "p-login",
      URL,
      1440,
      new AbortController().signal,
    );
    answer({ ok: false, failure: "login-page" });
    expect(await joined).toEqual(captureFailed("login-page"));
    await vi.runAllTimersAsync();
    expect(mocks.storeWorkspaceBlob).not.toHaveBeenCalled();
    expect(mocks.addSnapshot).not.toHaveBeenCalled();
    expect(mocks.emitSquiggy).not.toHaveBeenCalled();
  });

  it("is forgotten once it fails, so opening the project captures again", async () => {
    const answer = slowCapture();
    captureNewWebsite("p-failed", URL);
    answer({ ok: false, failure: "unreachable" });
    await vi.waitFor(() => expect(mocks.requestCapture).toHaveBeenCalledTimes(1));
    await vi.runAllTimersAsync();
    mocks.requestCapture.mockResolvedValue(captured);
    const retry = await serverBackend.captureSnapshot(
      "p-failed",
      URL,
      1440,
      new AbortController().signal,
    );
    expect(retry).toMatchObject({ ok: true });
    expect(mocks.requestCapture).toHaveBeenCalledTimes(2);
  });
});

describe("a snapshot taken in the viewer", () => {
  it("of a login page saves nothing and doesn't tell Squiggy", async () => {
    mocks.requestCapture.mockResolvedValue({ ok: false, failure: "login-page" });
    const outcome = await serverBackend.captureSnapshot(
      "p-viewer",
      "https://acme.example/",
      1440,
      new AbortController().signal,
    );
    expect(outcome).toEqual(captureFailed("login-page"));
    expect(mocks.storeWorkspaceBlob).not.toHaveBeenCalled();
    expect(mocks.emitSquiggy).not.toHaveBeenCalled();
  });

  it("tells Squiggy when its upload fails, even for a project the server no longer has", async () => {
    mocks.requestCapture.mockResolvedValue({
      ok: true,
      blob: new Blob(["jpeg"], { type: "image/jpeg" }),
      width: 1440,
      height: 2400,
      scale: 1,
    });
    mocks.storeWorkspaceBlob.mockResolvedValue({ ok: false, status: 404, error: "not-found" });
    const outcome = await serverBackend.captureSnapshot(
      "p-viewer",
      "https://acme.example/",
      1440,
      new AbortController().signal,
    );
    expect(outcome).toEqual(captureFailed("storage"));
    expect(mocks.emitSquiggy).toHaveBeenCalledWith({ type: "save-failed" });
    expect(mocks.hasProject).not.toHaveBeenCalled();
  });

  it("says the capture was partial, and records the snapshot like any other", async () => {
    mocks.requestCapture.mockResolvedValue({
      ok: true,
      blob: new Blob(["jpeg"], { type: "image/jpeg" }),
      width: 1440,
      height: 900,
      scale: 1,
      partial: true,
    });
    mocks.storeWorkspaceBlob.mockResolvedValue({ ok: true });
    mocks.addSnapshot.mockImplementation((snapshot: object) => ({ ok: true, value: snapshot }));
    const outcome = await serverBackend.captureSnapshot(
      "p-viewer",
      "https://acme.example/",
      1440,
      new AbortController().signal,
    );
    expect(outcome).toMatchObject({ ok: true, partial: true, snapshot: { height: 900 } });
    expect(mocks.addSnapshot).toHaveBeenCalledWith(expect.not.objectContaining({ partial: true }));
  });
});
