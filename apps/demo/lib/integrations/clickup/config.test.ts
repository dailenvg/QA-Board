import { describe, expect, it } from "vitest";
import { clickUpApiUrl } from "./config";

const SECRET = { AUTH_SECRET: "test-auth-secret-0123456789abcdef" };

describe("clickUpApiUrl", () => {
  it("is ClickUp's API, as long as tokens can be sealed", () => {
    expect(clickUpApiUrl(SECRET)).toBe("https://api.clickup.com/api");
    expect(clickUpApiUrl({})).toBeNull();
    expect(clickUpApiUrl({ AUTH_SECRET: " " })).toBeNull();
  });

  it("takes a stub on this machine over plain http, without its trailing slash", () => {
    for (const host of ["127.0.0.1:3101", "localhost:3101", "[::1]:3101"]) {
      expect(clickUpApiUrl({ ...SECRET, CLICKUP_API_URL: `http://${host}/api/` })).toBe(
        `http://${host}/api`,
      );
    }
  });

  it("turns the integration off for any other stub, and for every stub on production", () => {
    const refused = [
      "https://127.0.0.1:3101",
      "http://evil.test/api/v2",
      "https://api.clickup.com.evil.test/api/v2",
      "http://10.0.0.5",
      "not a url",
    ];
    for (const url of refused) {
      expect(clickUpApiUrl({ ...SECRET, CLICKUP_API_URL: url }), url).toBeNull();
    }
    expect(
      clickUpApiUrl({
        ...SECRET,
        VERCEL_ENV: "production",
        CLICKUP_API_URL: "http://127.0.0.1:3101",
      }),
    ).toBeNull();
  });
});
