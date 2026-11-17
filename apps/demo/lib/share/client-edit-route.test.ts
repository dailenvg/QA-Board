import { describe, expect, it, vi } from "vitest";
import * as clientCommentRoute from "@/app/api/s/[token]/comments/[commentId]/route";
import * as clientCommentsRoute from "@/app/api/s/[token]/comments/route";
import * as createRoute from "@/app/api/shares/route";
import { STATE } from "@/test/share-fixture";
import { EDIT_KEY_HEADER } from "./http";
import type { CreatedShare, PostedComment } from "./types";

vi.mock("@/lib/auth/guards", () => import("@/test/signed-in").then((m) => m.signedInGuards));

let ip = 0;
/** Each request from its own address (unless `from` names one), so per-IP limits don't interfere. */
function request(path: string, init: RequestInit & { from?: string } = {}): Request {
  ip += 1;
  const headers = new Headers(init.headers);
  headers.set("x-forwarded-for", init.from ?? `198.51.100.${ip % 250}`);
  return new Request(`http://localhost${path}`, { ...init, headers });
}

async function create(): Promise<CreatedShare> {
  const response = await createRoute.POST(
    request("/api/shares", { method: "POST", body: JSON.stringify(STATE) }),
  );
  return (await response.json()) as CreatedShare;
}

/** Posts client comment `id` on the link `token`; answers what the route sent back. */
async function post(token: string, id: string): Promise<{ status: number; body: PostedComment }> {
  const form = new FormData();
  form.set("comment", JSON.stringify({ id, x: 1, y: 1, body: "Hi", author: "Cleo" }));
  const response = await clientCommentsRoute.POST(
    request(`/api/s/${token}/comments`, { method: "POST", body: form }),
    { params: Promise.resolve({ token }) },
  );
  return { status: response.status, body: (await response.json()) as PostedComment };
}

interface EditInit {
  key?: string | null;
  body?: unknown;
  origin?: string;
  from?: string;
}

function edit(token: string, id: string, { key, body, origin, from }: EditInit = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", host: "localhost" };
  if (key) headers[EDIT_KEY_HEADER] = key;
  if (origin) headers.origin = origin;
  return clientCommentRoute.PATCH(
    request(`/api/s/${token}/comments/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body ?? { body: "Bigger logo" }),
      from,
    }),
    { params: Promise.resolve({ token, commentId: id }) },
  );
}

describe("POST /api/s/:token/comments", () => {
  it("answers the new comment with its edit key", async () => {
    const share = await create();
    const { status, body } = await post(share.token, "k-1");
    expect(status).toBe(201);
    expect(body).toMatchObject({ id: "k-1", status: "active" });
    expect(body.editKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("PATCH /api/s/:token/comments/:id", () => {
  it("saves the client's new words with their key, from this site", async () => {
    const share = await create();
    const { body: posted } = await post(share.token, "k-1");
    const response = await edit(share.token, "k-1", {
      key: posted.editKey,
      origin: "http://localhost",
    });
    expect(response.status).toBe(200);
    const saved = (await response.json()) as Record<string, unknown>;
    expect(saved).toMatchObject({ id: "k-1", body: "Bigger logo", status: "active" });
    expect(saved.editedAt).toEqual(expect.any(Number));
    expect(saved).not.toHaveProperty("editKey");
  });

  it("answers a wrong or missing key, and another link's comment, with a plain 404", async () => {
    const share = await create();
    const other = await create();
    const { body: posted } = await post(share.token, "k-1");
    const answers = [
      await edit(share.token, "k-1", { key: "x".repeat(43) }),
      await edit(share.token, "k-1", { key: null }),
      await edit(other.token, "k-1", { key: posted.editKey }),
      await edit(share.token, "c-1", { key: posted.editKey }),
      await edit(share.token, "not an id", { key: posted.editKey }),
    ];
    for (const response of answers) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not-found" });
    }
  });

  it("refuses another site, before anything else", async () => {
    const share = await create();
    const { body: posted } = await post(share.token, "k-1");
    const response = await edit(share.token, "k-1", {
      key: posted.editKey,
      origin: "https://evil.example",
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "cross-site" });
  });

  it("refuses empty and oversized words", async () => {
    const share = await create();
    const { body: posted } = await post(share.token, "k-1");
    for (const body of [{ body: "   " }, { body: "x".repeat(5_001) }, {}]) {
      expect((await edit(share.token, "k-1", { key: posted.editKey, body })).status).toBe(400);
    }
  });

  it("brakes many edits from one address", async () => {
    const share = await create();
    const { body: posted } = await post(share.token, "k-1");
    const from = "192.0.2.77";
    const statuses: number[] = [];
    for (let index = 0; index < 21; index += 1) {
      statuses.push((await edit(share.token, "k-1", { key: posted.editKey, from })).status);
    }
    expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});
