import { afterEach, describe, expect, it, vi } from "vitest";
import * as clientRepliesRoute from "@/app/api/s/[token]/comments/[commentId]/replies/route";
import * as changesRoute from "@/app/api/shares/[shareId]/changes/route";
import * as createRoute from "@/app/api/shares/route";
import * as viewRoute from "@/app/api/s/[token]/route";
import { COMMENT, REPLY, STATE } from "@/test/share-fixture";
import { OWNER_KEY_HEADER } from "./http";
import { SHARE_LIMITS } from "./limits";
import { shareServices } from "./server";
import type { ClientView, CreatedShare, SharedReply, ShareChanges } from "./types";

vi.mock("@/lib/auth/guards", () => import("@/test/signed-in").then((m) => m.signedInGuards));

afterEach(() => {
  vi.useRealTimers();
});

const HOUR = 3_600_000;
const AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Version/18.1 Safari/604.1";

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

interface ReplyInit {
  id?: string;
  body?: unknown;
  origin?: string;
  from?: string;
}

/** A guest's reply to `commentId` on the link `token`. */
function reply(
  token: string,
  commentId: string,
  { id = "k-1", body, origin, from }: ReplyInit = {},
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: "localhost",
    "user-agent": AGENT,
  };
  if (origin) headers.origin = origin;
  const sent = body ?? {
    id,
    body: "Thanks, looks good.",
    author: "Cleo",
    clientInfo: { viewport: { width: 390, height: 844 }, dpr: 3 },
  };
  return clientRepliesRoute.POST(
    request(`/api/s/${token}/comments/${commentId}/replies`, {
      method: "POST",
      headers,
      body: JSON.stringify(sent),
      from,
    }),
    { params: Promise.resolve({ token, commentId }) },
  );
}

async function errorOf(response: Response): Promise<{ status: number; error: unknown }> {
  const body = (await response.json()) as { error?: unknown };
  return { status: response.status, error: body.error };
}

async function view(token: string): Promise<ClientView> {
  const response = await viewRoute.GET(request(`/api/s/${token}`), {
    params: Promise.resolve({ token }),
  });
  return (await response.json()) as ClientView;
}

async function pull(share: CreatedShare, since = 0): Promise<ShareChanges> {
  const response = await changesRoute.GET(
    request(`/api/shares/${share.shareId}/changes?since=${since}`, {
      headers: { [OWNER_KEY_HEADER]: share.ownerKey },
    }),
    { params: Promise.resolve({ shareId: share.shareId }) },
  );
  return (await response.json()) as ShareChanges;
}

describe("POST /api/s/:token/comments/:commentId/replies", () => {
  it("adds the guest's reply with the server's time, and its browser beside it for the team", async () => {
    const share = await create();
    const before = Date.now();
    const response = await reply(share.token, COMMENT.id);
    expect(response.status).toBe(201);
    const posted = (await response.json()) as SharedReply;
    const { createdAt, ...words } = posted;
    expect(words).toEqual({
      id: "k-1",
      commentId: COMMENT.id,
      body: "Thanks, looks good.",
      author: "Cleo",
    });
    expect(createdAt).toBeGreaterThanOrEqual(before);
    // The guest reads it, without any browser details.
    const read = await view(share.token);
    expect(read.replies).toEqual([posted]);
    expect(JSON.stringify(read)).not.toMatch(/clientInfo|iPhone|viewport/);
    // The owner's pull brings it with the browser, the user agent from the request.
    const pulled = await pull(share);
    expect(pulled.replies).toEqual([
      {
        ...posted,
        clientInfo: { userAgent: AGENT, viewport: { width: 390, height: 844 }, dpr: 3 },
      },
    ]);
    // The comment stays as it was (D5).
    expect(read.comments.find((comment) => comment.id === COMMENT.id)?.status).toBe("active");
  });

  it("answers an id already taken with 409 exists, so a retry knows it got through", async () => {
    const share = await create();
    expect((await reply(share.token, COMMENT.id)).status).toBe(201);
    expect(await errorOf(await reply(share.token, COMMENT.id))).toEqual({
      status: 409,
      error: "exists",
    });
    expect((await view(share.token)).replies).toHaveLength(1);
  });

  it("answers an unknown comment, one still being posted and another link's with a plain 404", async () => {
    const share = await create();
    const other = await create();
    const { store } = await shareServices();
    const pending = { ...COMMENT, id: "c-pending" };
    await store.insertComment(share.shareId, pending, "client", {
      claim: "n-1",
      cropKey: "crop:c-pending:n-1",
    });
    const answers = [
      await reply(share.token, "c-unknown"),
      await reply(share.token, "c-pending"),
      await reply(share.token, "not an id"),
      await reply("x".repeat(43), COMMENT.id),
    ];
    for (const response of answers) {
      expect(await errorOf(response)).toEqual({ status: 404, error: "not-found" });
    }
    // The same comment id on another link takes it there, not here.
    expect((await reply(other.token, COMMENT.id)).status).toBe(201);
    expect((await view(share.token)).replies).toEqual([]);
  });

  it("refuses a comment the team resolved with 409 locked (D4)", async () => {
    const share = await create();
    const { store } = await shareServices();
    await store.upsertComment(share.shareId, { ...COMMENT, status: "resolved" }, "owner");
    expect(await errorOf(await reply(share.token, COMMENT.id))).toEqual({
      status: 409,
      error: "locked",
    });
  });

  it("refuses a full thread and a full link with 413 share-full, the team's replies counted", async () => {
    const share = await create();
    const { store } = await shareServices();
    for (let index = 0; index < SHARE_LIMITS.repliesPerComment; index += 1) {
      await store.upsertReply(share.shareId, { ...REPLY, id: `t-${index}` });
    }
    expect(await errorOf(await reply(share.token, COMMENT.id))).toEqual({
      status: 413,
      error: "share-full",
    });
    // Other comments take replies until the link holds 5000.
    const comments = SHARE_LIMITS.replies / SHARE_LIMITS.repliesPerComment;
    for (let index = 1; index < comments; index += 1) {
      const commentId = `c-${index + 1}`;
      await store.upsertComment(share.shareId, { ...COMMENT, id: commentId }, "owner");
      for (let at = 0; at < SHARE_LIMITS.repliesPerComment - (index === 1 ? 1 : 0); at += 1) {
        await store.upsertReply(share.shareId, { ...REPLY, id: `t-${index}-${at}`, commentId });
      }
    }
    expect((await reply(share.token, "c-2")).status).toBe(201);
    await store.upsertComment(share.shareId, { ...COMMENT, id: "c-new" }, "owner");
    expect(await errorOf(await reply(share.token, "c-new", { id: "k-2" }))).toEqual({
      status: 413,
      error: "share-full",
    });
  }, 30_000);

  it("refuses replies once the review window is over (D3), leaving them readable", async () => {
    const share = await create();
    expect((await reply(share.token, COMMENT.id)).status).toBe(201);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 73 * HOUR);
    expect(await errorOf(await reply(share.token, COMMENT.id, { id: "k-2" }))).toEqual({
      status: 403,
      error: "review-closed",
    });
    expect((await view(share.token)).replies.map((entry) => entry.id)).toEqual(["k-1"]);
  });

  it("refuses another site, before anything else", async () => {
    const share = await create();
    const response = await reply(share.token, COMMENT.id, { origin: "https://evil.example" });
    expect(await errorOf(response)).toEqual({ status: 403, error: "cross-site" });
    expect((await view(share.token)).replies).toEqual([]);
  });

  it("refuses empty, oversized and nameless replies", async () => {
    const share = await create();
    const bodies = [
      { id: "k-1", body: "   ", author: "Cleo" },
      { id: "k-1", body: "x".repeat(5_001), author: "Cleo" },
      { id: "k-1", body: "Hi", author: " " },
      { id: "k 1", body: "Hi", author: "Cleo" },
      { body: "Hi", author: "Cleo" },
    ];
    for (const body of bodies) {
      expect((await reply(share.token, COMMENT.id, { body })).status).toBe(400);
    }
  });

  it("brakes many replies from one address", async () => {
    const share = await create();
    const from = "192.0.2.78";
    const statuses: number[] = [];
    for (let index = 0; index < 21; index += 1) {
      statuses.push((await reply(share.token, COMMENT.id, { id: `k-${index}`, from })).status);
    }
    expect(statuses.slice(0, 20).every((status) => status === 201)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});
