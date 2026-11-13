import { describe, expect, it } from "vitest";
import { inviteCopy, inviteMessage, inviteTimeLeft, type InviteDetails } from "./invite-copy";

const HOUR = 60 * 60 * 1000;
const SENT_AT = Date.UTC(2026, 10, 12, 16, 30);

const DETAILS: InviteDetails = {
  company: "E2E Agency",
  project: "Spring Campaign",
  client: "Acme Studio",
  link: "https://squint.test/s/abc",
  reviewEndsAt: SENT_AT + 72 * HOUR,
  hasPassword: true,
  sentAt: SENT_AT,
};

describe("an invitation's copy", () => {
  it("greets the client, names the company and the project, the time left and the password", () => {
    expect(inviteCopy(DETAILS)).toEqual({
      subject: "E2E Agency has invited you to review Spring Campaign",
      greeting: "Hi Acme Studio,",
      headline: "E2E Agency has invited you to review Spring Campaign",
      deadline: "You have about 3 days to comment.",
      passwordNote:
        "The review is password protected. E2E Agency will send you the password separately.",
      howTo: "No account needed: open the link, drop a pin and leave a comment.",
    });
  });

  it("greets plainly without a client, and leaves out the deadline and password note when there's none", () => {
    const copy = inviteCopy({ ...DETAILS, client: null, reviewEndsAt: null, hasPassword: false });
    expect(copy.greeting).toBe("Hi,");
    expect(copy.deadline).toBeNull();
    expect(copy.passwordNote).toBeNull();
  });

  it("says how long is left, never a date or time a reader in another zone would misread", () => {
    expect(inviteCopy(DETAILS).deadline).not.toMatch(/UTC|AM|PM|Nov/);
    expect(inviteTimeLeft(SENT_AT + 7 * 24 * HOUR, SENT_AT)).toBe("about 7 days");
    // A link created a minute ago still reads as its full window.
    expect(inviteTimeLeft(SENT_AT + 72 * HOUR - 60_000, SENT_AT)).toBe("about 3 days");
    expect(inviteTimeLeft(SENT_AT + 48 * HOUR, SENT_AT)).toBe("about 2 days");
    expect(inviteTimeLeft(SENT_AT + 47 * HOUR, SENT_AT)).toBe("about 47 hours");
    expect(inviteTimeLeft(SENT_AT + 24 * HOUR - 60_000, SENT_AT)).toBe("about 24 hours");
    expect(inviteTimeLeft(SENT_AT + 70 * 60_000, SENT_AT)).toBe("about 1 hour");
    expect(inviteTimeLeft(SENT_AT + 59 * 60_000, SENT_AT)).toBe("less than an hour");
  });

  it("counts from when it goes out", () => {
    const later = inviteCopy({ ...DETAILS, sentAt: SENT_AT + 48 * HOUR });
    expect(later.deadline).toBe("You have about 24 hours to comment.");
    const closed = inviteCopy({ ...DETAILS, sentAt: SENT_AT + 72 * HOUR });
    expect(closed.deadline).toBe("The review window has closed.");
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
        "You have about 3 days to comment.",
        "The review is password protected. E2E Agency will send you the password separately.",
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
