import { describe, expect, it, vi } from "vitest";
import { resetEmailHtml, resetEmailSender, resetEmailText } from "./reset-email";

describe("reset email", () => {
  it("skips sending without Resend settings, logging no address or link", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const link = "https://squint.test/reset/secret-token";
    await resetEmailSender({})({ to: "ana@acme.test", link });
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("reset email skipped");
    expect(logged).not.toContain("secret-token");
    expect(logged).not.toContain("ana@acme.test");
  });

  it("puts the link in both bodies, escaped in the HTML", () => {
    expect(resetEmailText("https://squint.test/reset/abc")).toContain(
      "https://squint.test/reset/abc",
    );
    expect(resetEmailHtml('https://squint.test/reset/"x"&y')).toContain(
      'href="https://squint.test/reset/&quot;x&quot;&amp;y"',
    );
  });
});
