import { describe, expect, it } from "vitest";
import { buildDeepLink } from "./deeplink";

describe("buildDeepLink", () => {
  it("uses the server origin, keeps query and hash, drops the token", () => {
    expect(
      buildDeepLink(
        "https://feature-x.preview.app",
        "/pricing",
        "https://evil.example/elsewhere?plan=pro&review=secret&pin=old#faq",
        "p1",
      ),
    ).toBe("https://feature-x.preview.app/pricing?plan=pro&pin=p1#faq");
  });
});
