import { beforeEach, describe, expect, it, vi } from "vitest";
import { describeError } from "../../auth/http";
import {
  memberInviteEmail,
  memberInviteEmailSender,
  MemberInviteEmailRefused,
  type MemberInviteDetails,
} from "./invite-email";

const resend = vi.hoisted(() => ({
  batch: vi.fn<(emails: unknown) => Promise<{ error: { name: string; message: string } | null }>>(),
}));

vi.mock("resend", () => ({
  Resend: class {
    batch = { send: resend.batch };
  },
}));

const ENV = { RESEND_API_KEY: "re_test_key", EMAIL_FROM: "Squint <noreply@squint.test>" };

const DETAILS: MemberInviteDetails = {
  workspace: "Acme Studio",
  inviter: "Ana Ruiz",
  email: "cleo@client.test",
  link: "https://squint.test/join/abc",
};

const BRAND = { iconUrl: "https://squint.test/icon.png", color: "#7a1fa2" };

beforeEach(() => {
  resend.batch.mockReset();
  resend.batch.mockResolvedValue({ error: null });
});

describe("the invite email", () => {
  it("names who invited them, and says the same in text and HTML", () => {
    const email = memberInviteEmail(DETAILS);
    expect(email.subject).toBe("Ana Ruiz has invited you to join Acme Studio on Squint");
    for (const body of [email.text, email.html]) {
      expect(body).toContain("Hi,");
      expect(body).toContain("Ana Ruiz has invited you to join Acme Studio on Squint");
      expect(body).toContain("This invite is for cleo@client.test and works for 7 days.");
      expect(body).toContain("Join to review projects and leave comments with Acme Studio.");
      expect(body).toContain(
        "You got this email because someone at Acme Studio invited this address to Squint.",
      );
      expect(body).toContain("https://squint.test/join/abc");
    }
    expect(email.html).toContain('<a href="https://squint.test/join/abc"');
    expect(email.html).toContain(">Join Acme Studio</a>");
    expect(email.text).toContain("Join Acme Studio: https://squint.test/join/abc");
  });

  it("says they've been invited when whoever invited them has no name", () => {
    const email = memberInviteEmail({ ...DETAILS, inviter: null });
    expect(email.subject).toBe("You've been invited to join Acme Studio on Squint");
    expect(email.text).toContain("You've been invited to join Acme Studio on Squint.");
    expect(email.html).toContain(">You've been invited to join Acme Studio on Squint</h1>");
  });

  it("escapes every value in the HTML, and keeps the subject on one line", () => {
    const email = memberInviteEmail(
      {
        workspace: `<b>Evil</b> & "Co"`,
        inviter: "<script>alert(1)</script>\r\nBcc: x@evil.test",
        email: `<img src=x onerror=alert(1)>@x.test`,
        link: `https://squint.test/join/a"onmouseover="x`,
      },
      { iconUrl: `https://squint.test/i"onerror="x`, color: null },
    );
    expect(email.html).not.toMatch(/<script|<img src=x|<b>|"onmouseover|"onerror/);
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).toContain("&quot;Co&quot;");
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.subject).toContain("Bcc: x@evil.test has invited you");
  });

  it("tops the HTML with the workspace's icon and name, and colors the button its way", () => {
    const { html, text } = memberInviteEmail(DETAILS, BRAND);
    expect(html).toContain('<img src="https://squint.test/icon.png"');
    expect(html).toContain(">Acme Studio</td>");
    expect(html).toContain("background:#7a1fa2;color:#ffffff");
    expect(text).not.toContain("icon.png");
  });

  it("shows the name alone without an icon, on Squint's blue without a readable color", () => {
    const { html } = memberInviteEmail(DETAILS, { iconUrl: null, color: "#ffe14d" });
    expect(html).not.toContain("<img");
    expect(html).toContain(">Acme Studio</td>");
    expect(html).toContain("background:#0c54cc;color:#ffffff");
  });
});

describe("sending invite emails", () => {
  it("sends one email per invite, each with its own link, in one batch, from the workspace", async () => {
    const from = '"Acme Studio via Squint" <noreply@squint.test>';
    await memberInviteEmailSender(ENV)({
      from,
      brand: BRAND,
      invites: [
        DETAILS,
        { ...DETAILS, email: "dan@client.test", link: "https://squint.test/join/def" },
      ],
    });
    expect(resend.batch).toHaveBeenCalledTimes(1);
    const sent = resend.batch.mock.calls[0]?.[0] as Array<Record<string, string>>;
    expect(sent.map((email) => [email.to, email.from])).toEqual([
      ["cleo@client.test", from],
      ["dan@client.test", from],
    ]);
    expect(sent[0]?.text).toContain("/join/abc");
    expect(sent[1]?.text).toContain("/join/def");
    expect(sent[1]?.text).toContain("This invite is for dan@client.test");
    for (const email of sent) {
      expect(Object.keys(email).sort()).toEqual(["from", "html", "subject", "text", "to"]);
    }
  });

  it("falls back to EMAIL_FROM without a workspace sender", async () => {
    await memberInviteEmailSender(ENV)({ from: null, brand: BRAND, invites: [DETAILS] });
    const sent = resend.batch.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(sent[0]?.from).toBe("Squint <noreply@squint.test>");
  });

  it("skips without Resend settings, logging no address or link", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await memberInviteEmailSender({})({ from: null, brand: BRAND, invites: [DETAILS] });
    expect(warn.mock.calls).toEqual([
      ["squint members: invite email skipped (RESEND_API_KEY or EMAIL_FROM not set)"],
    ]);
    expect(resend.batch).not.toHaveBeenCalled();
  });

  it("throws Resend's refusal as a MemberInviteEmailRefused, redacted for the logs", async () => {
    resend.batch.mockResolvedValue({
      error: { name: "validation_error", message: "Can't send to cleo@client.test." },
    });
    const sending = memberInviteEmailSender(ENV)({ from: null, brand: BRAND, invites: [DETAILS] });
    await expect(sending).rejects.toBeInstanceOf(MemberInviteEmailRefused);
    const error: unknown = await sending.catch((caught: unknown) => caught);
    expect(describeError(error)).toBe(
      "MemberInviteEmailRefused: validation_error Can't send to [address]",
    );
  });
});
