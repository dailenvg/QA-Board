import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Comment } from "@/lib/store/types";
import { NOT_SENT, type PendingCrop, type ReadyCrop } from "@/lib/viewer-backend/backend";
import { sendDraft } from "./send-draft";

const rect = { x: 0, y: 0, width: 10, height: 10 };
const picture: ReadyCrop = { blob: new Blob(["jpeg"], { type: "image/jpeg" }), rect };
const comment = { id: "c-1" } as Comment;
const posted = () => Promise.resolve({ ok: true as const, value: comment });
const failing = (): PendingCrop => ({ blob: Promise.resolve(null), rect });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("sendDraft", () => {
  it("renders the screenshot first, then posts with it", async () => {
    const post = vi.fn(posted);
    const sent = await sendDraft({
      crop: null,
      takeCrop: () => ({ blob: Promise.resolve(picture.blob), rect }),
      onCropRetry: () => {},
      post,
    });
    expect(post).toHaveBeenCalledWith(picture);
    expect(sent).toEqual({ result: { ok: true, value: comment }, crop: picture });
  });

  it("reuses an earlier try's screenshot without reading the screen again", async () => {
    const takeCrop = vi.fn(failing);
    const post = vi.fn(posted);
    await sendDraft({ crop: picture, takeCrop, onCropRetry: () => {}, post });
    expect(takeCrop).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith(picture);
  });

  it("posts without a screenshot once every try failed, saying it's retrying meanwhile", async () => {
    const post = vi.fn(posted);
    const onCropRetry = vi.fn();
    const sending = sendDraft({ crop: null, takeCrop: failing, onCropRetry, post });
    await vi.runAllTimersAsync();
    const sent = await sending;
    expect(onCropRetry).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(null);
    expect(sent.result.ok).toBe(true);
  });

  it("never stays busy: a post that throws ends as an error to retry", async () => {
    const sent = await sendDraft({
      crop: picture,
      takeCrop: null,
      onCropRetry: () => {},
      post: () => Promise.reject(new Error("boom")),
    });
    expect(sent).toEqual({ result: { ok: false, error: NOT_SENT }, crop: picture });
  });

  it("never stays busy: a screenshot that throws or never renders still ends in a post", async () => {
    let calls = 0;
    const takeCrop = (): PendingCrop => {
      calls += 1;
      if (calls === 1) throw new Error("InvalidStateError");
      return { blob: new Promise<Blob | null>(() => {}), rect };
    };
    const post = vi.fn(posted);
    const sending = sendDraft({ crop: null, takeCrop, onCropRetry: () => {}, post });
    await vi.runAllTimersAsync();
    expect((await sending).result.ok).toBe(true);
    expect(post).toHaveBeenCalledWith(null);
  });

  it("takes no screenshot where there's none to take (a live frame)", async () => {
    const post = vi.fn(posted);
    await sendDraft({ crop: null, takeCrop: null, onCropRetry: () => {}, post });
    expect(post).toHaveBeenCalledWith(null);
  });
});
