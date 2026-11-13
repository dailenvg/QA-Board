import { describe, expect, it } from "vitest";
import { inviteCopy, inviteDeadline, inviteMessage, type InviteDetails } from "./invite-copy";

const DETAILS: InviteDetails = {
  company: "E2E Agency",
  project: "Spring Campaign",
  client: "Acme Studio",
  link: "https://squint.test/s/abc",
  reviewEndsAt: Date.UTC(2026, 10, 15, 16, 30),
  hasPassword: true,
};

describe("an invitation's copy", () => {
  it("greets the client, names the company and the project, the deadline and the password", () => {
    expect(inviteCopy(DETAILS)).toEqual({
      subject: "E2E Agency has invited you to review Spring Campaign",
      greeting: "Hi Acme Studio,",
      headline: "E2E Agency has invited you to review Spring Campaign",
      deadline: "You can comment until Sun, Nov 15, 4:30 PM UTC.",
      passwordNote: "It's password protected. E2E Agency will send you the password separately.",
      howTo: "No account needed: open the link, drop a pin and leave a comment.",
    });
  });

  it("greets plainly without a client, and leaves out the deadline and password note when there's none", () => {
    const copy = inviteCopy({ ...DETAILS, client: null, reviewEndsAt: null, hasPassword: false });
    expect(copy.greeting).toBe("Hi,");
    expect(copy.deadline).toBeNull();
    expect(copy.passwordNote).toBeNull();
  });

  it("dates the deadline in UTC, whatever the server's zone", () => {
    expect(inviteDeadline(Date.UTC(2026, 0, 1, 0, 5))).toBe("Thu, Jan 1, 12:05 AM UTC");
  });
});

describe("an invitation as a message", () => {
  it("reads like the email, with the link on its own line", () => {
    expect(inviteMessage(DETAILS)).toBe(
      [
        "Hi Acme Studio,",
        "",
        "E2E Agency has invited you to review Spring Campaign:",
        "https://squint.test/s/abc",
        "",
        "You can comment until Sun, Nov 15, 4:30 PM UTC.",
        "It's password protected. E2E Agency will send you the password separately.",
      ].join("\n"),
    );
  });

  it("is just the greeting, invitation and link on an open link without a deadline", () => {
    expect(
      inviteMessage({ ...DETAILS, client: null, reviewEndsAt: null, hasPassword: false }),
    ).toBe(
      "Hi,\n\nE2E Agency has invited you to review Spring Campaign:\nhttps://squint.test/s/abc",
    );
  });

  it("never holds a password: it only knows whether there is one", () => {
    expect(Object.keys(DETAILS)).not.toContain("password");
    expect(inviteMessage(DETAILS)).not.toMatch(/password:/i);
  });
});
