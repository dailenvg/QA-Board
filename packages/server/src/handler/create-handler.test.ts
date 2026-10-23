import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInput, PNG_DATA_URL } from "../../test/fixtures";
import { createMemoryStorage } from "../storage/memory-storage";
import type { StorageAdapter } from "../storage";
import type { ErrorResponse, ListPinsResponse, PinResponse } from "../types";
import { createPinpointHandler, type PinpointHandlerOptions } from "./create-handler";

const TOKEN = "review-token-123";
const URL_BASE = "https://feature-x.preview.app/api/pinpoint";

interface RequestInitLike {
  method?: string;
  token?: string | null;
  body?: unknown;
  headers?: Record<string, string>;
  query?: string;
}

function request({
  method = "GET",
  token = TOKEN,
  body,
  headers = {},
  query = "",
}: RequestInitLike = {}) {
  return new Request(`${URL_BASE}${query}`, {
    method,
    headers: {
      ...(token ? { "x-pinpoint-token": token } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

function setup(options: Partial<PinpointHandlerOptions> = {}) {
  let id = 0;
  const storage = options.storage ?? createMemoryStorage();
  const handler = createPinpointHandler({
    storage,
    reviewToken: TOKEN,
    branch: "feature/x",
    deploymentUrl: "https://feature-x-abc123.preview.app",
    linkBaseUrl: "https://feature-x.preview.app",
    now: () => Date.parse("2026-10-23T10:00:00.000Z"),
    generateId: () => `id-${(id += 1)}`,
    ...options,
  });
  return { handler, storage };
}

async function readBody<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth", () => {
  it("returns 500 with a clear message when no review token is configured", async () => {
    vi.stubEnv("PINPOINT_REVIEW_TOKEN", "");
    const { handler } = setup({ reviewToken: undefined });
    const response = await handler.GET(request({ query: "?path=/" }));
    expect(response.status).toBe(500);
    expect((await readBody<ErrorResponse>(response)).error).toContain("PINPOINT_REVIEW_TOKEN");
  });

  it("falls back to PINPOINT_REVIEW_TOKEN from the environment", async () => {
    vi.stubEnv("PINPOINT_REVIEW_TOKEN", TOKEN);
    const { handler } = setup({ reviewToken: undefined });
    expect((await handler.GET(request({ query: "?path=/" }))).status).toBe(200);
  });

  it.each(["GET", "POST", "PATCH"] as const)("%s returns 401 without a token", async (method) => {
    const { handler } = setup();
    const response = await handler[method](
      request({ method, token: null, query: "?path=/", body: method === "GET" ? undefined : {} }),
    );
    expect(response.status).toBe(401);
  });

  it("returns 401 for a wrong token and never echoes it", async () => {
    const { handler } = setup();
    const response = await handler.GET(request({ token: "guess-123", query: "?path=/" }));
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("guess-123");
  });

  it("accepts Authorization: Bearer", async () => {
    const { handler } = setup();
    const response = await handler.GET(
      request({ token: null, headers: { authorization: `Bearer ${TOKEN}` }, query: "?path=/" }),
    );
    expect(response.status).toBe(200);
  });
});

describe("GET", () => {
  it("lists pins for the branch and path with no-store caching", async () => {
    const { handler } = setup();
    await handler.POST(request({ method: "POST", body: createInput() }));
    const response = await handler.GET(request({ query: "?path=/pricing" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await readBody<ListPinsResponse>(response)).pins).toHaveLength(1);

    const other = await handler.GET(request({ query: "?path=/about" }));
    expect((await readBody<ListPinsResponse>(other)).pins).toHaveLength(0);
  });

  it("returns 400 when path is missing or malformed", async () => {
    const { handler } = setup();
    expect((await handler.GET(request())).status).toBe(400);
    expect((await handler.GET(request({ query: "?path=pricing" }))).status).toBe(400);
  });
});

describe("POST", () => {
  it("creates a pin with server-owned ids, branch, and a safe deep link", async () => {
    const { handler } = setup();
    const response = await handler.POST(request({ method: "POST", body: createInput() }));
    const { pin } = await readBody<PinResponse>(response);

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(pin).toMatchObject({
      id: "id-1",
      branch: "feature/x",
      deploymentUrl: "https://feature-x-abc123.preview.app",
      deepLink: "https://feature-x.preview.app/pricing?plan=pro&pin=id-1#faq",
      createdAt: "2026-10-23T10:00:00.000Z",
      resolved: false,
      replies: [],
    });
    expect(JSON.stringify(pin)).not.toContain("secret");
  });

  it("stores a valid screenshot", async () => {
    const { handler } = setup();
    const response = await handler.POST(
      request({ method: "POST", body: createInput({ screenshot: PNG_DATA_URL }) }),
    );
    expect(response.status).toBe(201);
    expect((await readBody<PinResponse>(response)).pin.screenshotUrl).toMatch(/^data:image\/png/);
  });

  it("returns 413 for screenshots over 1.5 MB decoded", async () => {
    const { handler } = setup();
    const oversized = `data:image/png;base64,${"A".repeat(2_097_200)}`;
    const response = await handler.POST(
      request({ method: "POST", body: createInput({ screenshot: oversized }) }),
    );
    expect(response.status).toBe(413);
  });

  it("returns 413 when the request body itself is too large", async () => {
    const { handler } = setup();
    const response = await handler.POST(
      request({ method: "POST", body: "x".repeat(3 * 1024 * 1024 + 1) }),
    );
    expect(response.status).toBe(413);
  });

  it("returns 400 for a screenshot that is not a single PNG or JPEG", async () => {
    const { handler } = setup();
    const response = await handler.POST(
      request({
        method: "POST",
        body: createInput({ screenshot: "data:image/svg+xml;base64,PHN2Zz4=" }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid JSON and schema violations without echoing input", async () => {
    const { handler } = setup();
    expect((await handler.POST(request({ method: "POST", body: "{not json" }))).status).toBe(400);

    const response = await handler.POST(
      request({ method: "POST", body: createInput({ author: "   ", body: "<script>x</script>" }) }),
    );
    expect(response.status).toBe(400);
    const { error } = await readBody<ErrorResponse>(response);
    expect(error).toContain("author");
    expect(error).not.toContain("<script>");
  });

  it("rate limits POSTs per IP with 429 and Retry-After", async () => {
    const { handler } = setup({ rateLimit: { limit: 2, windowMs: 60_000 } });
    const post = (ip: string) =>
      handler.POST(
        request({
          method: "POST",
          body: createInput(),
          headers: { "x-forwarded-for": `${ip}, 10.0.0.1` },
        }),
      );

    expect((await post("1.2.3.4")).status).toBe(201);
    expect((await post("1.2.3.4")).status).toBe(201);
    const limited = await post("1.2.3.4");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect((await post("5.6.7.8")).status).toBe(201);
  });

  it("can disable rate limiting", async () => {
    const { handler } = setup({ rateLimit: false });
    for (let i = 0; i < 12; i += 1) {
      expect((await handler.POST(request({ method: "POST", body: createInput() }))).status).toBe(
        201,
      );
    }
  });
});

describe("PATCH", () => {
  it("adds replies and resolves", async () => {
    const { handler } = setup();
    await handler.POST(request({ method: "POST", body: createInput() }));

    const replied = await handler.PATCH(
      request({
        method: "PATCH",
        body: { action: "reply", pinId: "id-1", author: "Bo", body: "On it" },
      }),
    );
    expect(replied.status).toBe(200);
    expect((await readBody<PinResponse>(replied)).pin.replies).toEqual([
      { id: "id-2", author: "Bo", body: "On it", createdAt: "2026-10-23T10:00:00.000Z" },
    ]);

    const resolved = await handler.PATCH(
      request({ method: "PATCH", body: { action: "resolve", pinId: "id-1", author: "Bo" } }),
    );
    expect((await readBody<PinResponse>(resolved)).pin).toMatchObject({
      resolved: true,
      resolvedBy: "Bo",
    });
  });

  it("returns 404 for an unknown pin", async () => {
    const { handler } = setup();
    const response = await handler.PATCH(
      request({ method: "PATCH", body: { action: "resolve", pinId: "missing", author: "Bo" } }),
    );
    expect(response.status).toBe(404);
  });

  it("returns 400 for an unknown action", async () => {
    const { handler } = setup();
    const response = await handler.PATCH(
      request({ method: "PATCH", body: { action: "delete", pinId: "id-1" } }),
    );
    expect(response.status).toBe(400);
  });
});

describe("errors", () => {
  it("hides unexpected storage errors behind a generic 500", async () => {
    const storage: StorageAdapter = {
      listPins: () => Promise.reject(new Error("db password is hunter2")),
      createPin: () => Promise.reject(new Error("unused")),
      addReply: () => Promise.reject(new Error("unused")),
      resolvePin: () => Promise.reject(new Error("unused")),
    };
    const { handler } = setup({ storage });
    const response = await handler.GET(request({ query: "?path=/" }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("hunter2");
  });
});

describe("storage error mapping", () => {
  it("maps branded storage errors from another bundle copy to their status", async () => {
    const foreign = Object.assign(new Error("Pin x not found"), {
      status: 404,
      pinpointStorageError: true,
    });
    const storage: StorageAdapter = {
      listPins: () => Promise.resolve([]),
      createPin: () => Promise.reject(foreign),
      addReply: () => Promise.reject(foreign),
      resolvePin: () => Promise.reject(foreign),
    };
    const { handler } = setup({ storage });
    const response = await handler.PATCH(
      request({ method: "PATCH", body: { action: "resolve", pinId: "x", author: "Bo" } }),
    );
    expect(response.status).toBe(404);
  });
});
