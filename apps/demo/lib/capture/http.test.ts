import { describe, expect, it } from "vitest";
import { captureFailure } from "./http";

describe("a capture route's failure", () => {
  it("answers a login page with 422 and its code", async () => {
    const response = captureFailure("login-page");
    expect(response.status).toBe(422);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "login-page" });
  });
});
