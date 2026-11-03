import { describe, expect, it } from "vitest";
import { authOrigin } from "./auth-url";

describe("authOrigin", () => {
  it("prefers AUTH_URL, then the site URL", () => {
    expect(authOrigin({ AUTH_URL: "https://www.squintreview.com" }).origin).toBe(
      "https://www.squintreview.com",
    );
    expect(authOrigin({ VERCEL_URL: "squint-abc.vercel.app" }).origin).toBe(
      "https://squint-abc.vercel.app",
    );
    expect(authOrigin({}).origin).toBe("http://localhost:3000");
  });
});
