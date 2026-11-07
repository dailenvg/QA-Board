import { describe, expect, it, vi } from "vitest";
import { describeError } from "./http";
import {
  redactResendMessage,
  resetEmailHtml,
  resetEmailSender,
  resetEmailText,
  ResetEmailRefused,
} from "./reset-email";

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

  it("logs Resend's reason with links and addresses blanked", () => {
    const refused = new ResetEmailRefused(
      "validation_error",
      "The squintreview.com domain is not verified. Please, add and verify your domain on https://resend.com/domains",
    );
    expect(describeError(refused)).toBe(
      "ResetEmailRefused: validation_error The squintreview.com domain is not verified. Please, add and verify your domain on [link]",
    );
    expect(
      redactResendMessage(
        "You can only send testing emails to your own email address (ana@acme.test).",
      ),
    ).toBe("You can only send testing emails to your own email address [address]");
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
