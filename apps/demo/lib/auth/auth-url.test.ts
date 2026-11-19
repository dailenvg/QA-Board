import { describe, expect, it } from "vitest";
import { authOrigin } from "./auth-url";

describe("authOrigin", () => {
  it("prefers BETTER_AUTH_URL, then AUTH_URL, then the site URL", () => {
    expect(
      authOrigin({
        BETTER_AUTH_URL: "https://auth.squint.test",
        AUTH_URL: "https://www.squintreview.com",
      }).origin,
    ).toBe("https://auth.squint.test");
    expect(authOrigin({ AUTH_URL: "https://www.squintreview.com" }).origin).toBe(
      "https://www.squintreview.com",
    );
    expect(authOrigin({ VERCEL_URL: "squint-abc.vercel.app" }).origin).toBe(
      "https://squint-abc.vercel.app",
    );
    expect(authOrigin({}).origin).toBe("http://localhost:3000");
  });

  it("treats a blank variable as unset, as the e2e server sets AUTH_URL", () => {
    expect(authOrigin({ BETTER_AUTH_URL: " ", AUTH_URL: "" }).origin).toBe("http://localhost:3000");
  });
});
