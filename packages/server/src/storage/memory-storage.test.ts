import { describe, expect, it } from "vitest";
import { draft, PNG_BYTES } from "../../test/fixtures";
import { PinNotFoundError } from "../storage";
import { createMemoryStorage } from "./memory-storage";

describe("createMemoryStorage", () => {
  it("scopes pins by branch and path", async () => {
    const storage = createMemoryStorage();
    await storage.createPin(draft());
    await storage.createPin(draft({ id: "other-branch", branch: "main" }));
    await storage.createPin(draft({ id: "other-path", path: "/about" }));

    const pins = await storage.listPins({ branch: "feature/x", path: "/pricing" });
    expect(pins.map((pin) => pin.id)).toEqual(["pin-1"]);
  });

  it("inlines screenshots as data URLs by default", async () => {
    const storage = createMemoryStorage();
    const pin = await storage.createPin(
      draft({ screenshot: { contentType: "image/png", data: PNG_BYTES } }),
    );
    expect(pin.screenshotUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("replies and resolves, and rejects unknown pins", async () => {
    const storage = createMemoryStorage();
    await storage.createPin(draft());
    const reply = { id: "r1", author: "Bo", body: "Done", createdAt: "2026-10-23T11:00:00.000Z" };
    expect(
      (await storage.addReply({ branch: "feature/x", pinId: "pin-1", reply })).replies,
    ).toEqual([reply]);
    const resolved = await storage.resolvePin({
      branch: "feature/x",
      pinId: "pin-1",
      resolvedBy: "Bo",
      resolvedAt: "2026-10-23T12:00:00.000Z",
    });
    expect(resolved).toMatchObject({ resolved: true, resolvedBy: "Bo" });
    await expect(
      storage.addReply({ branch: "main", pinId: "pin-1", reply }),
    ).rejects.toBeInstanceOf(PinNotFoundError);
  });
});
