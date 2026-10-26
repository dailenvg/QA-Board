import { afterEach, describe, expect, it, vi } from "vitest";
import { VIEW } from "@/test/share-fixture";
import { createClientBackend } from "./client-backend";
import { createClientStore } from "./client-store";
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

function setup(answers: Array<() => Response>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", (url: string) => {
    calls.push(url);
    const answer = answers.shift();
    return answer ? Promise.resolve(answer()) : Promise.reject(new TypeError("offline"));
  });
  const store = createClientStore({ ...VIEW, comments: [] });
  const backend = createClientBackend({ token: TOKEN, store, blobs: createServerBlobs(TOKEN) });
  return { store, backend, calls };
}

const accepted = () =>
  Response.json({ ...input, status: "active", createdAt: 5, updatedAt: 5 }, { status: 201 });

afterEach(() => vi.unstubAllGlobals());

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
});
