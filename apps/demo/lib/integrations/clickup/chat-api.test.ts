import { describe, expect, it } from "vitest";
import { ClickUpError, type Fetch } from "./api";
import { listClickUpChannels, postClickUpMessage } from "./chat-api";

const API = "https://api.clickup.com/api";
const TOKEN = `pk_1234_${"A".repeat(32)}`;
const CHANNELS = `${API}/v3/workspaces/9012/chat/channels`;

/** A fake `fetch` answering each call in turn, recording what it was asked. */
function answering(...answers: Array<{ body: unknown; status?: number }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher: Fetch = (url, init) => {
    calls.push({ url, init });
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
    return Promise.resolve(Response.json(answer?.body ?? {}, { status: answer?.status ?? 200 }));
  };
  return { fetcher, calls };
}

const channel = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  type: "CHANNEL",
  archived: false,
  is_hidden: false,
  ...extra,
});

describe("listClickUpChannels", () => {
  it("reads every page with its cursor and keeps open channels only, by name", async () => {
    const { fetcher, calls } = answering(
      {
        body: {
          data: [
            channel("c-2", "design"),
            channel("dm-1", "Ana", { type: "DM" }),
            channel("g-1", "Ana, Bo", { type: "GROUP_DM" }),
            channel("c-old", "Old", { archived: true }),
          ],
          next_cursor: "page 2",
        },
      },
      {
        body: {
          data: [
            channel("c-1", "Announcements"),
            channel("c-hidden", "Hidden", { is_hidden: true }),
            channel("c-3", "‮bugs\n"),
            { id: "odd" },
            channel("c-2", "design"),
          ],
          next_cursor: null,
        },
      },
    );
    const channels = await listClickUpChannels(API, TOKEN, "9012", fetcher);
    expect(calls.map(({ url }) => url)).toEqual([
      `${CHANNELS}?limit=100`,
      `${CHANNELS}?limit=100&cursor=page+2`,
    ]);
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe(TOKEN);
    expect(calls[0]?.init.redirect).toBe("error");
    expect(channels).toEqual([
      { id: "c-1", name: "Announcements" },
      { id: "c-3", name: "bugs" },
      { id: "c-2", name: "design" },
    ]);
  });

  it("stops after 10 pages, however many ClickUp offers", async () => {
    const { fetcher, calls } = answering({ body: { data: [], next_cursor: "more" } });
    expect(await listClickUpChannels(API, TOKEN, "9012", fetcher)).toEqual([]);
    expect(calls).toHaveLength(10);
  });

  it("fails on an answer in another shape, naming the call without its query", async () => {
    const { fetcher } = answering({ body: { channels: [] } });
    const error = await listClickUpChannels(API, TOKEN, "9012", fetcher).catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(ClickUpError);
    expect((error as Error).message).toBe(
      "GET /v3/workspaces/…/chat/channels answered in an unknown shape",
    );
  });
});

describe("postClickUpMessage", () => {
  const target = { teamId: "9012", channelId: "c/1" };

  it("posts Markdown with who it's assigned to and followed by", async () => {
    const { fetcher, calls } = answering({ body: { id: "m-1" } });
    const posted = await postClickUpMessage(
      API,
      TOKEN,
      target,
      { content: "**Hi**", assignee: "81", followers: ["82", "83"] },
      fetcher,
    );
    expect(posted).toEqual({ url: null });
    expect(calls[0]?.url).toBe(`${CHANNELS}/c%2F1/messages`);
    expect(calls[0]?.init.method).toBe("POST");
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get("authorization")).toBe(TOKEN);
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
      type: "message",
      content: "**Hi**",
      content_format: "text/md",
      assignee: "81",
      followers: ["82", "83"],
    });
  });

  it("leaves out an empty assignee and followers", async () => {
    const { fetcher, calls } = answering({ body: {} });
    await postClickUpMessage(API, TOKEN, target, { content: "x", followers: [] }, fetcher);
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
      type: "message",
      content: "x",
      content_format: "text/md",
    });
  });

  it("answers ClickUp's link only when it's on ClickUp's own site", async () => {
    const link = "https://app.clickup.com/9012/chat/r/c-1?m=m-1";
    for (const [body, url] of [
      [{ url: link }, link],
      [{ data: { link } }, link],
      [{ url: "https://evil.test/x" }, null],
      [{ url: "javascript:alert(1)" }, null],
      [{ url: "http://app.clickup.com/x" }, null],
      [null, null],
    ] as const) {
      const posted = await postClickUpMessage(
        API,
        TOKEN,
        target,
        { content: "x" },
        answering({ body }).fetcher,
      );
      expect(posted.url, JSON.stringify(body)).toBe(url);
    }
  });

  it("says which status ClickUp answered, never what it said", async () => {
    const { fetcher } = answering({ body: { err: `Channel not found for ${TOKEN}` }, status: 404 });
    const error = await postClickUpMessage(API, TOKEN, target, { content: "x" }, fetcher).catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(ClickUpError);
    expect((error as ClickUpError).status).toBe(404);
    expect((error as Error).message).toBe(
      "POST /v3/workspaces/9012/chat/channels/c%2F1/messages answered 404",
    );
  });
});
