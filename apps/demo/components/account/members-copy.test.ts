import { describe, expect, it } from "vitest";
import type { InviteChip } from "../viewer/invite-chips";
import { inviteFieldMessage } from "./invite-field-copy";
import { counted, MEMBERS_COPY, type ResendState } from "./members-copy";

const INVITE = MEMBERS_COPY.invite;
const INVITES = MEMBERS_COPY.invites;

const chip = (address: string, problem: InviteChip["problem"] = null): InviteChip => ({
  address,
  problem,
});

describe("Members copy: counts say one and many (4b.0)", () => {
  it("counts seats, people and addresses", () => {
    expect(counted(1, "seat", "seats")).toBe("1 seat");
    expect(counted(0, "seat", "seats")).toBe("0 seats");
    expect(INVITE.hint(1)).toBe("1 seat left");
    expect(INVITE.hint(7)).toBe("7 seats left");
    expect(INVITE.seats.breakdown(1, 0)).toBe("1 person · 0 invited");
    expect(INVITE.seats.breakdown(3, 2)).toBe("3 people · 2 invited");
    expect(INVITE.seats.valueText(4, 10)).toBe("4 of 10 seats used");
    expect(INVITE.overflow(1, 1)).toBe("Only 1 seat is left, so 1 address wasn't added.");
    expect(INVITE.overflow(2, 3)).toBe("Only 2 seats are left, so 3 addresses weren't added.");
    expect(INVITES.expiresIn(1)).toBe("Expires in 1 day");
    expect(INVITES.expiresIn(5)).toBe("Expires in 5 days");
    expect(MEMBERS_COPY.empty.line(1)).toBe("Invite 1 more person to review with you.");
    expect(MEMBERS_COPY.empty.line(9)).toBe("Invite up to 9 people to review with you.");
  });

  it("says what a send did: sent or created, one or several, and who wasn't invited", () => {
    expect(INVITE.done(["ana@x.com"], 0, true)).toBe("Invite sent to ana@x.com.");
    expect(INVITE.done(["a@x.com", "b@x.com"], 0, true)).toBe("Invites sent to 2 people.");
    expect(INVITE.done(["ana@x.com"], 0, false)).toBe("Invite created for ana@x.com.");
    expect(INVITE.done(["a@x.com", "b@x.com", "c@x.com"], 0, false)).toBe(
      "Invites created for 3 people.",
    );
    expect(INVITE.done(["a@x.com", "b@x.com"], 2, true)).toBe(
      "Invites sent to 2 people. 2 addresses weren't invited: the reason is on each marked chip.",
    );
    expect(INVITE.done(["a@x.com"], 1, true)).toBe(
      "Invite sent to a@x.com. 1 address wasn't invited: the reason is on its chip.",
    );
    expect(INVITE.notEmailed(1)).toMatch(/^Invite created, but the email didn't go out\./);
  });

  it("reads Send and Create by count, and while it's posting", () => {
    expect(INVITE.send(0, false, true)).toBe("Send invites");
    expect(INVITE.send(1, false, true)).toBe("Send 1 invite");
    expect(INVITE.send(3, false, true)).toBe("Send 3 invites");
    expect(INVITE.send(3, true, true)).toBe("Sending…");
    expect(INVITE.send(1, false, false)).toBe("Create invite");
    expect(INVITE.send(2, false, false)).toBe("Create 2 invites");
    expect(INVITE.send(2, true, false)).toBe("Creating…");
  });

  it("says when every seat is taken, the only one, or more than the limit", () => {
    expect(INVITE.full.title(10)).toBe("All 10 seats are taken.");
    expect(INVITE.full.title(1)).toBe("The only seat is taken.");
    expect(INVITE.full.overTitle("Acme", 12, 10)).toBe(
      "Acme has more people than seats (12 of 10).",
    );
  });
});

describe("Members copy: the resend item (4b.2)", () => {
  it("says resend with email on, renew with it off, and why it's off", () => {
    const on = (state: ResendState, expired = false) => INVITES.resend(state, expired, true);
    const off = (state: ResendState, expired = false) => INVITES.resend(state, expired, false);
    expect(on("ready")).toBe("Resend email");
    expect(on("ready", true)).toBe("Resend and renew");
    expect(on("busy")).toBe("Resending…");
    expect(on("just-sent")).toBe("Resend email (sent just now)");
    expect(on("no-seat", true)).toBe("Resend and renew (no seat free)");
    expect(off("ready")).toBe("Renew link");
    expect(off("ready", true)).toBe("Renew link");
    expect(off("busy")).toBe("Renewing…");
    expect(off("no-seat", true)).toBe("Renew link (no seat free)");
    // Nothing is sent with email off, so it never says so.
    for (const state of ["ready", "busy", "just-sent", "no-seat", "limited"] as const) {
      expect(off(state)).not.toMatch(/Resend|email/);
    }
  });

  it("names the already-invited button with its address, before any reason", () => {
    const named = (state: ResendState, emailEnabled = true) =>
      INVITE.resendFor(INVITES.resend(state, false, emailEnabled), "ana@x.com");
    expect(named("ready")).toBe("Resend email for ana@x.com");
    expect(named("busy")).toBe("Resending for ana@x.com…");
    expect(named("just-sent")).toBe("Resend email for ana@x.com (sent just now)");
    expect(named("limited")).toBe("Resend email for ana@x.com (daily limit reached)");
    expect(named("ready", false)).toBe("Renew link for ana@x.com");
    expect(named("busy", false)).toBe("Renewing for ana@x.com…");
    expect(named("no-seat", false)).toBe("Renew link for ana@x.com (no seat free)");
  });
});

describe("Members copy: card A's description and Send's reason (4b.2)", () => {
  it("only promises an email when email is on", () => {
    expect(INVITE.description("Acme", true)).toBe(
      "Invite teammates who aren't in another Squint workspace. Each gets an email with a link to join Acme that works for 7 days.",
    );
    expect(INVITE.description("Acme", false)).toBe(
      "Invite teammates who aren't in another Squint workspace. Each invite has a link to join Acme that works for 7 days.",
    );
  });

  it("says one marked address or several", () => {
    expect(INVITE.blocker.marked(1)).toBe("Remove the marked address first.");
    expect(INVITE.blocker.marked(2)).toBe("Remove the marked addresses first.");
  });
});

describe("inviteFieldMessage", () => {
  const where = { workspace: "Acme Studio", left: 2 };

  it("gives each refused address its reason, leaving already-invited to its own line", () => {
    expect(inviteFieldMessage([chip("a@x.com")], 0, where)).toBeNull();
    expect(
      inviteFieldMessage(
        [
          chip("nope", "invalid"),
          chip("ana@x.com", "already-member"),
          chip("bo@x.com", "in-another-workspace"),
          chip("cy@x.com", "already-invited"),
          chip("admin@x.com", "cannot-invite"),
        ],
        1,
        where,
      ),
    ).toBe(
      [
        `"nope" isn't an email address. Remove it and type it again.`,
        "ana@x.com is already in Acme Studio.",
        "bo@x.com already uses Squint in another workspace. For now, each person can be in only one.",
        "This address can't be invited. Try a different one.",
        "Only 2 seats are left, so 1 address wasn't added.",
      ].join(" "),
    );
  });

  it("never uses an em dash", () => {
    const all = JSON.stringify(MEMBERS_COPY, (_key, value: unknown) =>
      typeof value === "function" ? String(value) : value,
    );
    expect(all).not.toMatch(/—/);
  });
});
