import { describe, expect, it, vi } from "vitest";
import { createHttpClient } from "./api-client";
import { PinpointRequestError, PinpointUnauthorizedError } from "./client";
import { createPinInput, pinFixture } from "../test/fixtures";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function setup(response: Response = jsonResponse(200, { pins: [] })) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
  return { fetch, client: createHttpClient({ fetch }) };
}

function lastRequest(fetch: ReturnType<typeof setup>["fetch"]) {
  const [url, init] = fetch.mock.calls.at(-1) ?? [];
  return { url, init, headers: (init?.headers ?? {}) as Record<string, string> };
}

describe("createHttpClient", () => {
  it("makes no request without a token", async () => {
    const { fetch, client } = setup();
    await expect(client.listPins("", { path: "/" })).rejects.toBeInstanceOf(
      PinpointUnauthorizedError,
    );
    await expect(client.createPin("  ", createPinInput())).rejects.toBeInstanceOf(
      PinpointUnauthorizedError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("lists pins for a path and sends the token header", async () => {
    const pins = [pinFixture()];
    const { fetch, client } = setup(jsonResponse(200, { pins }));

    await expect(client.listPins("tok", { path: "/a b" })).resolves.toEqual(pins);
    const { url, init, headers } = lastRequest(fetch);
    expect(url).toBe("/api/pinpoint?path=%2Fa%20b");
    expect(init?.method).toBe("GET");
    expect(headers["x-pinpoint-token"]).toBe("tok");
  });

  it("posts new pins as JSON", async () => {
    const pin = pinFixture();
    const { fetch, client } = setup(jsonResponse(201, { pin }));
    const input = createPinInput();

    await expect(client.createPin("tok", input)).resolves.toEqual(pin);
    const { init, headers } = lastRequest(fetch);
    expect(init?.method).toBe("POST");
    expect(headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init?.body as string)).toEqual(input);
  });

  it("sends replies and resolves as a discriminated PATCH", async () => {
    const pin = pinFixture();
    const { fetch, client } = setup(jsonResponse(200, { pin }));

    await client.addReply("tok", { pinId: "pin-1", author: "Bo", body: "Done" });
    expect(JSON.parse(lastRequest(fetch).init?.body as string)).toEqual({
      action: "reply",
      pinId: "pin-1",
      author: "Bo",
      body: "Done",
    });

    fetch.mockResolvedValueOnce(jsonResponse(200, { pin }));
    await client.resolvePin("tok", { pinId: "pin-1", author: "Bo" });
    expect(JSON.parse(lastRequest(fetch).init?.body as string)).toEqual({
      action: "resolve",
      pinId: "pin-1",
      author: "Bo",
    });
    expect(lastRequest(fetch).init?.method).toBe("PATCH");
  });

  it("maps 401 to PinpointUnauthorizedError", async () => {
    const { client } = setup(jsonResponse(401, { error: "Invalid token" }));
    await expect(client.listPins("bad", { path: "/" })).rejects.toBeInstanceOf(
      PinpointUnauthorizedError,
    );
  });

  it("maps other failures to PinpointRequestError with the server message", async () => {
    const { client } = setup(jsonResponse(429, { error: "Slow down" }));
    const error = await client.listPins("tok", { path: "/" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PinpointRequestError);
    expect(error).toMatchObject({ status: 429, message: "Slow down" });
  });

  it("honours a custom endpoint that already has a query string", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(jsonResponse(200, { pins: [] }));
    await createHttpClient({ fetch, endpoint: "/feedback?site=a" }).listPins("tok", { path: "/" });
    expect(lastRequest(fetch).url).toBe("/feedback?site=a&path=%2F");
  });
});
