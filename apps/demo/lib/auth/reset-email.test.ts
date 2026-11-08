import { beforeEach, describe, expect, it, vi } from "vitest";
import { redactResendMessage } from "../email/resend";
import { describeError } from "./http";
import { resetEmailHtml, resetEmailSender, resetEmailText, ResetEmailRefused } from "./reset-email";

const resend = vi.hoisted(() => ({
  keys: [] as string[],
  send: vi.fn<(email: unknown) => Promise<{ error: { name: string; message: string } | null }>>(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resend.send };
    constructor(key: string) {
      resend.keys.push(key);
    }
  },
}));

const ENV = { RESEND_API_KEY: "re_test_key", EMAIL_FROM: "Squint <noreply@squint.test>" };

beforeEach(() => {
  resend.keys.length = 0;
  resend.send.mockReset();
  resend.send.mockResolvedValue({ error: null });
});

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
    expect(resend.send).not.toHaveBeenCalled();
  });

  it("sends through Resend from EMAIL_FROM, with the link in both bodies", async () => {
    const link = "https://squint.test/reset/abc";
    await resetEmailSender(ENV)({ to: "ana@acme.test", link });
    expect(resend.keys).toEqual(["re_test_key"]);
    expect(resend.send).toHaveBeenCalledWith({
      from: "Squint <noreply@squint.test>",
      to: "ana@acme.test",
      subject: "Reset your Squint password",
      text: resetEmailText(link),
      html: resetEmailHtml(link),
    });
  });

  it("throws Resend's refusal as a ResetEmailRefused, redacted for the logs", async () => {
    resend.send.mockResolvedValue({
      error: { name: "validation_error", message: "Can't send to ana@acme.test." },
    });
    const sending = resetEmailSender(ENV)({ to: "ana@acme.test", link: "https://x.test/r/1" });
    await expect(sending).rejects.toBeInstanceOf(ResetEmailRefused);
    const error: unknown = await sending.catch((caught: unknown) => caught);
    expect(describeError(error)).toBe(
      "ResetEmailRefused: validation_error Can't send to [address]",
    );
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
