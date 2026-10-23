import { describe, expect, it } from "vitest";
import { PinpointRequestError, PinpointUnauthorizedError } from "../core/client";
import { createPinInput } from "../test/fixtures";
import { createMemoryClient } from "./memory-client";

describe("createMemoryClient", () => {
  it("creates, lists by path, replies, and resolves", async () => {
    const client = createMemoryClient({ branch: "feat/a" });
    const pin = await client.createPin(
      "tok",
      createPinInput({ pageUrl: "https://p.vercel.app/?review=secret" }),
    );

    expect(pin).toMatchObject({ branch: "feat/a", resolved: false, replies: [] });
    expect(pin.deepLink).toBe(`https://p.vercel.app/?pin=${pin.id}`);
    expect(await client.listPins("tok", { path: "/" })).toHaveLength(1);
    expect(await client.listPins("tok", { path: "/other" })).toHaveLength(0);

    const replied = await client.addReply("tok", { pinId: pin.id, author: "Bo", body: "On it" });
    expect(replied.replies).toHaveLength(1);

    const resolved = await client.resolvePin("tok", { pinId: pin.id, author: "Bo" });
    expect(resolved).toMatchObject({ resolved: true, resolvedBy: "Bo" });
  });

  it("returns copies so callers cannot mutate the store", async () => {
    const client = createMemoryClient();
    const pin = await client.createPin("tok", createPinInput());
    pin.body = "mutated";
    const [stored] = await client.listPins("tok", { path: "/" });
    expect(stored?.body).toBe("Make this bigger");
  });

  it("rejects invalid tokens like the server would", async () => {
    const client = createMemoryClient({ isTokenValid: (token) => token === "good" });
    await expect(client.listPins("bad", { path: "/" })).rejects.toBeInstanceOf(
      PinpointUnauthorizedError,
    );
    await expect(client.listPins("good", { path: "/" })).resolves.toEqual([]);
  });

  it("404s for unknown pins", async () => {
    const client = createMemoryClient();
    await expect(
      client.resolvePin("tok", { pinId: "missing", author: "Bo" }),
    ).rejects.toBeInstanceOf(PinpointRequestError);
  });
});
