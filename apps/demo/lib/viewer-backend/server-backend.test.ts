import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CROP_ATTEMPTS } from "../crop/crop-retry";

const mocks = vi.hoisted(() => ({
  addComment: vi.fn(),
  attachCrop: vi.fn(),
  storeWorkspaceBlob: vi.fn(),
}));

vi.mock("../store/actions", () => ({
  addComment: mocks.addComment,
  addSnapshot: vi.fn(),
  attachCrop: mocks.attachCrop,
  deleteComment: vi.fn(),
  editComment: vi.fn(),
  replaceWithImage: vi.fn(),
  restoreComment: vi.fn(),
  setAuthorName: vi.fn(),
  setCommentStatus: vi.fn(),
}));
vi.mock("../workspace-client/blob-upload", () => ({
  storeWorkspaceBlob: mocks.storeWorkspaceBlob,
}));

const { serverBackend } = await import("./server-backend");

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
