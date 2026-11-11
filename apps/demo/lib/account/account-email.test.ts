import { beforeEach, describe, expect, it, vi } from "vitest";
import { describeError } from "../auth/http";
import {
  AccountEmailRefused,
  deletionNoticeLines,
  deletionNoticeSender,
  EMAIL_CHANGED_NOTICE,
  emailChangedNoticeSender,
  emailChangeLinkHtml,
  emailChangeLinkSender,
  emailChangeLinkText,
} from "./account-email";

const send = vi.hoisted(() =>
  vi.fn<(email: unknown) => Promise<{ error: { name: string; message: string } | null }>>(),
);

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const ENV = { RESEND_API_KEY: "re_test_key", EMAIL_FROM: "Squint <noreply@squint.test>" };

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({ error: null });
});

describe("account emails", () => {
  it("mail the change link to the new address from EMAIL_FROM, sender Squint", async () => {
    const link = "https://squint.test/email-change/abc";
    await emailChangeLinkSender(ENV)({ to: "new@acme.test", link });
    expect(send).toHaveBeenCalledWith({
      from: "Squint <noreply@squint.test>",
      to: "new@acme.test",
      subject: "Confirm your new Squint email",
      text: emailChangeLinkText(link),
      html: emailChangeLinkHtml(link),
    });
    expect(emailChangeLinkText(link)).toContain(link);
    expect(emailChangeLinkHtml('https://x.test/"a"&b')).toContain(
      'href="https://x.test/&quot;a&quot;&amp;b"',
    );
  });

  it("tell the old address it changed, with no link in it", async () => {
    await emailChangedNoticeSender(ENV)("old@acme.test");
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "old@acme.test",
        subject: "Your Squint email changed",
        text: EMAIL_CHANGED_NOTICE,
      }),
    );
    expect(JSON.stringify(send.mock.calls)).not.toMatch(/https?:/);
  });

  it("tell an owner when their account and workspace go for good, with no link in it", async () => {
    const deleteAfter = Date.UTC(2026, 11, 2, 12);
    const notice = { to: "ana@acme.test", deleteAfter, workspaceName: "Acme & Co" };
    await deletionNoticeSender(ENV)(notice);
    const lines = deletionNoticeLines(notice);
    expect(lines.join(" ")).toContain("December 2, 2026");
    expect(lines.join(" ")).toContain("Acme & Co workspace");
    expect(lines.join(" ")).toMatch(/admin can restore it/);
    expect(send).toHaveBeenCalledWith({
      from: "Squint <noreply@squint.test>",
      to: "ana@acme.test",
      subject: "Your Squint account is scheduled for deletion",
      text: lines.join("\n\n"),
      html: expect.stringContaining("Acme &amp; Co workspace") as unknown,
    });
    expect(JSON.stringify(send.mock.calls)).not.toMatch(/https?:/);
  });

  it("leave the workspace out of a member's notice", () => {
    const lines = deletionNoticeLines({
      to: "bo@acme.test",
      deleteAfter: Date.UTC(2026, 11, 2),
      workspaceName: null,
    });
    expect(lines.join(" ")).not.toMatch(/workspace/);
  });

  it("skip sending without Resend settings, logging neither address nor link", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await emailChangeLinkSender({})({ to: "new@acme.test", link: "https://x.test/e/secret" });
    await emailChangedNoticeSender({})("old@acme.test");
    expect(send).not.toHaveBeenCalled();
    const logged = JSON.stringify(warn.mock.calls);
    expect(warn.mock.calls).toEqual([
      ["squint account: email change link skipped (RESEND_API_KEY or EMAIL_FROM not set)"],
      ["squint account: email changed notice skipped (RESEND_API_KEY or EMAIL_FROM not set)"],
    ]);
    expect(logged).not.toMatch(/acme\.test|secret/);
  });

  it("throw Resend's refusal, redacted for the logs", async () => {
    send.mockResolvedValue({ error: { name: "validation_error", message: "Bad new@acme.test" } });
    const error: unknown = await emailChangedNoticeSender(ENV)("old@acme.test").catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AccountEmailRefused);
    expect(describeError(error)).toBe("AccountEmailRefused: validation_error Bad [address]");
  });
});
