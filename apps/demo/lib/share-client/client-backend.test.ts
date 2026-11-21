import { afterEach, describe, expect, it, vi } from "vitest";
import { namesInMemory, VIEW } from "@/test/share-fixture";
import { CROP_ATTEMPTS, CROP_BACKOFF_MS } from "../crop/crop-retry";
import { createClientBackend } from "./client-backend";
import { createClientStore } from "./client-store";
import { linkEditKeys } from "./edit-keys";
import { createServerBlobs } from "./server-blobs";

const TOKEN = "t".repeat(43);
const input = {
  id: "draft-1",
  projectId: "shared",
  x: 1,
  y: 2,
  body: "Please fix",
  author: "Cleo",
};

function setup(answers: Array<() => Response>, comments = VIEW.comments.slice(0, 0)) {
  const calls: string[] = [];
  const sent: RequestInit[] = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit = {}) => {
    calls.push(url);
    sent.push(init);
    const answer = answers.shift();
    return answer ? Promise.resolve(answer()) : Promise.reject(new TypeError("offline"));
  });
  const kept = new Map<string, string>();
  const editKeys = linkEditKeys(TOKEN, () => ({
    getItem: (name) => kept.get(name) ?? null,
    setItem: (name, value) => void kept.set(name, value),
  }));
  const store = createClientStore(
    { ...VIEW, comments },
    { authorName: null, names: namesInMemory(), editKeys },
  );
  const backend = createClientBackend({ token: TOKEN, store, blobs: createServerBlobs(TOKEN) });
  return { store, backend, calls, sent, editKeys };
}

const accepted = () =>
  Response.json({ ...input, status: "active", createdAt: 5, updatedAt: 5 }, { status: 201 });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const crop = {
  blob: new Blob(["jpeg"], { type: "image/jpeg" }),
  rect: { x: 0, y: 0, width: 4, height: 3 },
};
const withCrop = () =>
  Response.json(
    { ...input, crop: { rect: crop.rect }, status: "active", createdAt: 5, updatedAt: 5 },
    { status: 201 },
  );
const failure =
  (status: number, error = "failed") =>
  () =>
    Response.json({ error }, { status });
/** Whether each comment request carried the screenshot. */
const cropsSent = (sent: RequestInit[]) =>
  sent
    .filter((init) => init.body instanceof FormData)
    .map((init) => (init.body as FormData).has("crop"));

describe("a comment's screenshot", () => {
  it("goes with the comment and shows at once", async () => {
    const { store, backend, sent } = setup([withCrop]);
    const result = await backend.addComment(input, crop);
    expect(result).toMatchObject({ ok: true, value: { crop: { blobKey: "crop:draft-1" } } });
    expect(cropsSent(sent)).toEqual([true]);
    expect(store.getSnapshot().view.comments[0]).not.toHaveProperty("screenshotPending");
  });

  it("is retried after a temporary failure, with a short backoff, and then goes through", async () => {
    vi.useFakeTimers();
    const { backend, sent } = setup([failure(503), failure(500), withCrop]);
    const sending = backend.addComment(input, crop);
    await vi.advanceTimersByTimeAsync(0);
    expect(cropsSent(sent)).toEqual([true]);
    await vi.advanceTimersByTimeAsync(CROP_BACKOFF_MS[0]);
    expect(cropsSent(sent)).toEqual([true, true]);
    await vi.advanceTimersByTimeAsync(CROP_BACKOFF_MS[1]);
    expect(await sending).toMatchObject({ ok: true, value: { crop: { rect: crop.rect } } });
    expect(cropsSent(sent)).toEqual([true, true, true]);
  });

  it("after CROP_ATTEMPTS failed uploads, the comment posts without it, marked pending", async () => {
    vi.useFakeTimers();
    const failures = Array.from({ length: CROP_ATTEMPTS }, () => failure(502));
    const { store, backend, sent } = setup([...failures, accepted]);
    const sending = backend.addComment(input, crop);
    await vi.runAllTimersAsync();
    const result = await sending;
    expect(result).toMatchObject({ ok: true, value: { screenshotPending: true } });
    expect(result.ok && result.value).not.toHaveProperty("crop");
    expect(cropsSent(sent)).toEqual([...failures.map(() => true), false]);
    expect(store.getSnapshot().view.comments[0]).toMatchObject({ screenshotPending: true });
  });

  it("refused for its own sake (too large) isn't sent again: the comment goes without it", async () => {
    const { backend, sent } = setup([failure(413, "too-large"), accepted]);
    const result = await backend.addComment(input, crop);
    expect(result).toMatchObject({ ok: true, value: { screenshotPending: true } });
    expect(cropsSent(sent)).toEqual([true, false]);
  });

  it("isn't retried or dropped when the refusal is about the comment", async () => {
    const { backend, sent } = setup([failure(403, "review-closed")]);
    const result = await backend.addComment(input, crop);
    expect(!result.ok && result.error).toContain("review window has closed");
    expect(cropsSent(sent)).toEqual([true]);
  });

  it("marks a comment sent without one (every render failed) as pending, never silently", async () => {
    const { store, backend, sent } = setup([accepted]);
    const result = await backend.addComment(input, null);
    expect(result).toMatchObject({ ok: true, value: { screenshotPending: true } });
    expect(cropsSent(sent)).toEqual([false]);
    expect(store.getSnapshot().view.comments[0]).toMatchObject({ screenshotPending: true });
  });

  it("posted without it but answered 'already exists': the link's copy says whether it had one", async () => {
    vi.useFakeTimers();
    const failures = Array.from({ length: CROP_ATTEMPTS }, () => failure(502));
    const stored = { ...input, status: "active" as const, createdAt: 5, updatedAt: 5 };
    const exists = failure(409, "exists");
    for (const [onLink, expected] of [
      [{ ...stored, crop: { rect: crop.rect } }, { crop: { rect: crop.rect } }],
      [{ ...stored, screenshotPending: true as const }, { screenshotPending: true }],
    ] as const) {
      const { backend } = setup([
        ...failures,
        exists,
        () => Response.json({ ...VIEW, comments: [onLink] }),
      ]);
      const sending = backend.addComment(input, crop);
      await vi.runAllTimersAsync();
      const result = await sending;
      expect(result).toMatchObject({ ok: true, value: expected });
      expect(result.ok && result.value).not.toHaveProperty(
        "crop" in expected ? "screenshotPending" : "crop",
      );
    }
  });

  it("gives every post a deadline, so a stalled connection can't leave it posting", async () => {
    const { backend, sent } = setup([accepted]);
    await backend.addComment(input, null);
    expect(sent[0]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("client comments", () => {
  it("reports a failed send without adding anything, so the draft keeps its text", async () => {
    const { store, backend } = setup([]);
    const result = await backend.addComment(input, null);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("wasn't sent");
    expect(store.getSnapshot().view.comments).toEqual([]);
  });

  it("sends again with the same id, and shows the comment once it's accepted", async () => {
    const { store, backend, calls } = setup([() => new Response("{}", { status: 500 }), accepted]);
    expect((await backend.addComment(input, null)).ok).toBe(false);
    expect((await backend.addComment(input, null)).ok).toBe(true);
    expect(store.getSnapshot().view.comments.map((c) => c.id)).toEqual(["draft-1"]);
    expect(calls.filter((url) => url.endsWith("/comments"))).toHaveLength(2);
  });

  it("treats 'already exists' as delivered (an earlier try got through)", async () => {
    const view = {
      ...VIEW,
      comments: [{ ...input, status: "active", createdAt: 5, updatedAt: 5 }],
    };
    const { store, backend } = setup([
      () => Response.json({ error: "exists" }, { status: 409 }),
      () => Response.json(view),
    ]);
    expect((await backend.addComment(input, null)).ok).toBe(true);
    expect(store.getSnapshot().view.comments.map((c) => c.id)).toEqual(["draft-1"]);
  });

  it("says why when the review is out of space", async () => {
    const { backend } = setup([() => Response.json({ error: "share-full" }, { status: 413 })]);
    const result = await backend.addComment(input, null);
    expect(!result.ok && result.error).toContain("out of space");
  });

  it("doesn't count a post still in progress as sent: the draft stays", async () => {
    const { store, backend } = setup([() => Response.json({ error: "pending" }, { status: 409 })]);
    const result = await backend.addComment(input, null);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("still being saved");
    expect(store.getSnapshot().view.comments).toEqual([]);
  });

  it("says the review window closed, and closes it here too, whatever this clock says", async () => {
    const { store, backend } = setup([
      () => Response.json({ error: "review-closed" }, { status: 403 }),
    ]);
    const result = await backend.addComment(input, null);
    expect(!result.ok && result.error).toContain("review window has closed");
    expect(store.getSnapshot().reviewClosed).toBe(true);
    expect(store.getSnapshot().view.comments).toEqual([]);
  });

  it("marks the link gone when the share was revoked", async () => {
    const { store, backend } = setup([
      () => Response.json({ error: "not-found" }, { status: 404 }),
    ]);
    expect((await backend.addComment(input, null)).ok).toBe(false);
    expect(store.getSnapshot().gone).toBe(true);
  });

  it("locks the link when it asks for its password again, keeping the draft unsent", async () => {
    const { store, backend } = setup([
      () => Response.json({ error: "password-required" }, { status: 401 }),
    ]);
    const result = await backend.addComment(input, null);
    expect(!result.ok && result.error).toContain("needs its password again");
    expect(store.getSnapshot().locked).toBe(true);
    expect(store.getSnapshot().view.comments).toEqual([]);
  });
});

describe("client snapshots", () => {
  it("lock the link when it asks for its password again", async () => {
    const { store, backend } = setup([
      () => Response.json({ error: "password-required" }, { status: 401 }),
    ]);
    const outcome = await backend.captureSnapshot("shared", "", 1280, new AbortController().signal);
    expect(outcome?.ok).toBe(false);
    expect(outcome && !outcome.ok && outcome.message).toContain("password");
    expect(store.getSnapshot().locked).toBe(true);
  });
});

describe("a client's edit of their own comment (4.12)", () => {
  const KEY = "k".repeat(43);
  const mine = { ...input, status: "active" as const, createdAt: 5, updatedAt: 5 };

  /** The guest posted `mine` from this browser, so it holds its key. */
  async function posted(answers: Array<() => Response>) {
    const created = () => Response.json({ ...mine, editKey: KEY }, { status: 201 });
    const context = setup([created, ...answers]);
    await context.backend.addComment(input, null);
    return context;
  }

  it("keeps the key from the post in this browser only, not in the view", async () => {
    const { store, editKeys } = await posted([]);
    expect(editKeys.keyOf("draft-1")).toBe(KEY);
    expect(store.getSnapshot().ownComments).toEqual(new Set(["draft-1"]));
    expect(JSON.stringify(store.getSnapshot().view)).not.toContain(KEY);
  });

  it("sends the key in its header, and shows the saved words", async () => {
    const saved = { ...mine, body: "Bigger logo", editedAt: 9, updatedAt: 9 };
    const { store, backend, calls, sent } = await posted([() => Response.json(saved)]);
    expect(await backend.editOwnComment?.("draft-1", "  Bigger logo ")).toEqual({ ok: true });
    expect(calls.at(-1)).toBe(`/api/s/${TOKEN}/comments/draft-1`);
    const request = sent.at(-1);
    expect(request?.method).toBe("PATCH");
    expect(new Headers(request?.headers).get("x-squint-edit-key")).toBe(KEY);
    expect(request?.body).toBe(JSON.stringify({ body: "Bigger logo" }));
    expect(store.getSnapshot().view.comments[0]).toMatchObject({
      body: "Bigger logo",
      editedAt: 9,
    });
  });

  it("sends nothing for the same words", async () => {
    const { backend, calls } = await posted([]);
    const before = calls.length;
    expect(await backend.editOwnComment?.("draft-1", "Please fix")).toEqual({
      ok: true,
      unchanged: true,
    });
    expect(calls).toHaveLength(before);
  });

  it("can't edit a comment this browser holds no key for", async () => {
    const { backend, calls } = setup([], [mine]);
    expect(await backend.editOwnComment?.("draft-1", "Mine?")).toEqual({
      ok: false,
      error: "This comment can't be edited any more.",
      final: true,
    });
    expect(calls).toEqual([]);
  });

  it.each([
    [409, { error: "locked" }, "The team resolved this comment while you were editing", true],
    [403, { error: "review-closed" }, "The review window has closed", true],
    [404, { error: "not-found" }, "This comment can't be edited any more.", true],
    [429, { error: "rate-limited" }, "You've made a lot of edits", false],
    [500, { error: "storage" }, "Couldn't save your edit.", false],
  ])("explains a %i in the editor, final: %s", async (status, body, words, final) => {
    const { backend } = await posted([
      () => Response.json(body, { status }),
      () => Response.json({ ...VIEW, comments: [{ ...mine, status: "resolved" }] }),
    ]);
    const outcome = await backend.editOwnComment?.("draft-1", "Bigger logo");
    expect(outcome).toMatchObject({ ok: false, final });
    expect(outcome?.ok === false && outcome.error).toContain(words);
  });

  it("says when it couldn't reach Squint, and lets Save try again", async () => {
    const { backend } = await posted([]);
    expect(await backend.editOwnComment?.("draft-1", "Bigger logo")).toEqual({
      ok: false,
      error: "Couldn't reach Squint. Check your connection and try again.",
      final: false,
    });
  });

  it("reads the link again after a resolve, and closes the review after the window", async () => {
    const resolved = { ...VIEW, comments: [{ ...mine, status: "resolved" }] };
    const locked = await posted([
      () => Response.json({ error: "locked" }, { status: 409 }),
      () => Response.json(resolved),
    ]);
    await locked.backend.editOwnComment?.("draft-1", "Bigger logo");
    await vi.waitFor(() =>
      expect(locked.store.getSnapshot().view.comments[0]?.status).toBe("resolved"),
    );
    const closed = await posted([() => Response.json({ error: "review-closed" }, { status: 403 })]);
    await closed.backend.editOwnComment?.("draft-1", "Bigger logo");
    expect(closed.store.getSnapshot().reviewClosed).toBe(true);
  });
});
