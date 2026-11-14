import { afterEach, describe, expect, it, vi } from "vitest";
import { loadClickUpChannels, loadClickUpPeople, sendToClickUp } from "./send-client";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";

/** Answers every request with `body` and `status`, recording what was asked. */
function answering(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(Response.json(body, { status, headers }));
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the Send to ClickUp client", () => {
  it("reads the channels and people from the workspace's routes", async () => {
    const calls = answering({ channels: [{ id: "c-1", name: "general" }] });
    expect(await loadClickUpChannels(WORKSPACE)).toEqual({
      ok: true,
      items: [{ id: "c-1", name: "general" }],
    });
    expect(calls[0]?.url).toBe(`/api/w/${WORKSPACE}/clickup/channels`);
    answering({ people: [] });
    expect(await loadClickUpPeople(WORKSPACE)).toEqual({ ok: true, items: [] });
  });

  it("calls an answer without its list a failure", async () => {
    answering({ people: [] });
    expect(await loadClickUpChannels(WORKSPACE)).toEqual({ ok: false, error: "failed" });
  });

  it("posts the draft as JSON, and answers ClickUp's link when there is one", async () => {
    const calls = answering({ url: "https://app.clickup.com/9012/chat/r/c-1" });
    const draft = { channelId: "c-1", note: "Hi", assignee: "81" };
    expect(await sendToClickUp(WORKSPACE, "p/1", draft)).toEqual({
      ok: true,
      url: "https://app.clickup.com/9012/chat/r/c-1",
    });
    expect(calls[0]?.url).toBe(`/api/w/${WORKSPACE}/projects/p%2F1/clickup`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual(draft);
    answering({ url: null });
    expect(await sendToClickUp(WORKSPACE, "p1", draft)).toEqual({ ok: true, url: null });
  });

  it("tells each refusal apart, and never throws", async () => {
    const draft = { channelId: "c-1", note: "", assignee: null };
    for (const [status, body, error] of [
      [409, { error: "not-connected" }, "not-connected"],
      [422, { error: "reconnect" }, "reconnect"],
      [409, { error: "channel-gone" }, "channel-gone"],
      [409, { error: "channel-forbidden" }, "channel-forbidden"],
      [409, { error: "archived" }, "archived"],
      [502, { error: "unreachable" }, "unreachable"],
      [503, { error: "unavailable" }, "unavailable"],
      [404, { error: "not-found" }, "not-found"],
      [401, { error: "unauthenticated" }, "signed-out"],
      [500, { error: "storage" }, "failed"],
    ] as const) {
      answering(body, status);
      expect(await sendToClickUp(WORKSPACE, "p1", draft), String(status)).toEqual({
        ok: false,
        error,
      });
    }
    answering({ error: "rate-limited", retryAfterSeconds: 120 }, 429);
    expect(await sendToClickUp(WORKSPACE, "p1", draft)).toEqual({
      ok: false,
      error: "rate-limited",
      retryAfterSeconds: 120,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("offline"))),
    );
    expect(await loadClickUpPeople(WORKSPACE)).toEqual({ ok: false, error: "offline" });
  });
});
