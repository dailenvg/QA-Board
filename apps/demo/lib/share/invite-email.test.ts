import { beforeEach, describe, expect, it, vi } from "vitest";
import { describeError } from "../auth/http";
import type { InviteDetails } from "./invite-copy";
import { inviteEmail, inviteEmailSender, InviteEmailRefused } from "./invite-email";

const resend = vi.hoisted(() => ({
  batch: vi.fn<(emails: unknown) => Promise<{ error: { name: string; message: string } | null }>>(),
}));

vi.mock("resend", () => ({
  Resend: class {
    batch = { send: resend.batch };
  },
}));

const ENV = { RESEND_API_KEY: "re_test_key", EMAIL_FROM: "Squint <noreply@squint.test>" };

const SENT_AT = Date.UTC(2026, 10, 12, 16, 30);

const DETAILS: InviteDetails = {
  company: "E2E Agency",
  project: "Spring Campaign",
  client: "Acme Studio",
  link: "https://squint.test/s/abc",
  reviewEndsAt: SENT_AT + 72 * 60 * 60 * 1000,
  hasPassword: true,
  sentAt: SENT_AT,
};

beforeEach(() => {
  resend.batch.mockReset();
  resend.batch.mockResolvedValue({ error: null });
});

describe("the invitation email", () => {
  it("greets the client and says the same in text and HTML", () => {
    const email = inviteEmail(DETAILS);
    expect(email.subject).toBe("E2E Agency has invited you to review Spring Campaign");
    for (const body of [email.text, email.html]) {
      expect(body).toContain("Hi Acme Studio,");
      expect(body).toContain("E2E Agency has invited you to review Spring Campaign");
      expect(body).toContain("https://squint.test/s/abc");
      expect(body).toContain("You have about 3 days to comment.");
      expect(body).toContain("password protected");
    }
    expect(email.html).toContain('<a href="https://squint.test/s/abc"');
    expect(email.html).toContain(">Open review</a>");
    expect(email.text).toContain("Open review: https://squint.test/s/abc");
  });

  it("greets plainly without a client, and says nothing of a deadline or password without them", () => {
    const email = inviteEmail({ ...DETAILS, client: null, reviewEndsAt: null, hasPassword: false });
    expect(email.text.startsWith("Hi,\n")).toBe(true);
    expect(email.html).toContain(">Hi,</p>");
    for (const body of [email.text, email.html]) {
      expect(body).not.toContain("to comment.");
      expect(body).not.toContain("password");
    }
  });

  it("escapes every value in the HTML", () => {
    const email = inviteEmail({
      ...DETAILS,
      company: `<b>Evil</b> & "Co"`,
      project: "<script>alert(1)</script>",
      client: `<img src=x onerror=alert(1)>`,
      link: `https://squint.test/s/a"onmouseover="x`,
    });
    expect(email.html).not.toMatch(/<script|<img|<b>|"onmouseover/);
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(email.html).toContain("&quot;Co&quot;");
  });

  it("keeps the subject on one line whatever the names hold", () => {
    const { subject } = inviteEmail({ ...DETAILS, project: "Spring\r\nBcc: someone@evil.test" });
    expect(subject).toBe("E2E Agency has invited you to review Spring Bcc: someone@evil.test");
  });
});

describe("sending invitations", () => {
  it("sends one email per address in a single batch, from the workspace's sender, without Reply-To", async () => {
    const from = '"E2E Agency via Squint" <noreply@squint.test>';
    await inviteEmailSender(ENV)({
      to: ["ana@acme.studio", "leo@acme.studio"],
      from,
      details: DETAILS,
    });
    expect(resend.batch).toHaveBeenCalledTimes(1);
    const sent = resend.batch.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(sent.map((email) => [email.to, email.from])).toEqual([
      ["ana@acme.studio", from],
      ["leo@acme.studio", from],
    ]);
    for (const email of sent) {
      expect(Object.keys(email).sort()).toEqual(["from", "html", "subject", "text", "to"]);
    }
  });

  it("falls back to EMAIL_FROM without a workspace sender", async () => {
    await inviteEmailSender(ENV)({ to: ["ana@acme.studio"], from: null, details: DETAILS });
    const sent = resend.batch.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(sent[0]?.from).toBe("Squint <noreply@squint.test>");
  });

  it("skips without Resend settings, logging no address or link", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await inviteEmailSender({})({ to: ["ana@acme.studio"], from: null, details: DETAILS });
    expect(warn.mock.calls).toEqual([
      ["squint share: invite email skipped (RESEND_API_KEY or EMAIL_FROM not set)"],
    ]);
    expect(resend.batch).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("throws Resend's refusal as an InviteEmailRefused, redacted for the logs", async () => {
    resend.batch.mockResolvedValue({
      error: { name: "validation_error", message: "Can't send to ana@acme.studio." },
    });
    const sending = inviteEmailSender(ENV)({
      to: ["ana@acme.studio"],
      from: null,
      details: DETAILS,
    });
    await expect(sending).rejects.toBeInstanceOf(InviteEmailRefused);
    const error: unknown = await sending.catch((caught: unknown) => caught);
    expect(describeError(error)).toBe(
      "InviteEmailRefused: validation_error Can't send to [address]",
    );
  });
});
