import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelMemberInvite,
  emailLimitMessage,
  inviteMembers,
  membersErrorMessage,
  removeMember,
  resendMemberInvite,
  saveMemberSwitches,
  seatsFullMessage,
  waitLabel,
  type MembersError,
} from "./members-client";

const USER = "00000000-0000-4000-8000-000000000001";
const INVITE = "00000000-0000-4000-8000-0000000000aa";
const CONTEXT = { ownerName: "Ana Ruiz", workspaceName: "Acme Studio" };

function answer(status: number, body: unknown = {}) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(body, { status }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("members client", () => {
  it("removes with a JSON DELETE, and sends all four switches by name", async () => {
    const fetch = answer(200, { ok: true });
    expect(await removeMember(USER)).toEqual({ ok: true });
    fetch.mockResolvedValue(Response.json({ permissions: ["trash", "people", "made-up"] }));
    expect(await saveMemberSwitches(USER, ["people", "trash"])).toEqual({
      ok: true,
      permissions: ["trash", "people"],
    });
    expect(fetch.mock.calls.map(([path, init]) => [path, init?.method, init?.body])).toEqual([
      [`/api/account/members/${USER}`, "DELETE", "{}"],
      [
        `/api/account/members/${USER}/permissions`,
        "PATCH",
        '{"reviewLinks":false,"trash":true,"import":false,"people":true}',
      ],
    ]);
  });

  it("tells each refusal apart", async () => {
    const cases: Array<[number, unknown, MembersError]> = [
      [404, { error: "not-found" }, "gone"],
      [409, { error: "leaving" }, "leaving"],
      [403, { error: "owner-only" }, "owner-only"],
      [403, { error: "not-allowed", permission: "members.manage" }, "not-allowed"],
      [403, { error: "not-allowed", permission: "members.manage", protected: true }, "protected"],
      [401, { error: "unauthenticated" }, "signed-out"],
      [409, { error: "owner" }, "failed"],
      [500, { error: "storage" }, "failed"],
    ];
    for (const [status, body, error] of cases) {
      answer(status, body);
      expect(await removeMember(USER), `${status} ${JSON.stringify(body)}`).toEqual({
        ok: false,
        error,
      });
    }
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    expect(await saveMemberSwitches(USER, [])).toEqual({ ok: false, error: "offline" });
  });
});

const INVITE_ACTIONS = [
  { kind: "invite", addresses: 3 },
  { kind: "resend", email: "cleo@x.test" },
  { kind: "cancel", email: "cleo@x.test" },
] as const;

describe("members client: invites", () => {
  it("sends every address in one POST, and reads each one's result and the seats", async () => {
    const results = [
      {
        email: "cleo@x.test",
        ok: true,
        invite: { id: INVITE, link: "https://squint.test/join/t", expiresAt: 1 },
        emailed: false,
      },
      { email: "ana@x.test", ok: false, error: "already-member" },
    ];
    const fetch = answer(200, { results, seats: { used: 3, limit: 10 } });
    expect(await inviteMembers(["cleo@x.test", "ana@x.test"])).toEqual({
      ok: true,
      results,
      seats: { used: 3, limit: 10 },
    });
    expect(fetch.mock.calls.map(([path, init]) => [path, init?.method, init?.body])).toEqual([
      ["/api/account/members/invites", "POST", '{"emails":["cleo@x.test","ana@x.test"]}'],
    ]);
  });

  it("tells a whole send's refusals apart, with what each says", async () => {
    answer(403, { error: "not-allowed", permission: "members.manage" });
    expect(await inviteMembers(["a@b.co"])).toEqual({ ok: false, error: "not-allowed" });
    answer(409, { error: "seats-full", used: 9, limit: 10 });
    expect(await inviteMembers(["a@b.co"])).toEqual({
      ok: false,
      error: "seats-full",
      seats: { used: 9, limit: 10 },
    });
    answer(429, { error: "rate-limited", retryAfterSeconds: 7200, sentInWindow: 50, limit: 50 });
    expect(await inviteMembers(["a@b.co"])).toEqual({
      ok: false,
      error: "rate-limited",
      retryAfterSeconds: 7200,
      sentInWindow: 50,
    });
    answer(404, { error: "not-found" });
    expect(await inviteMembers(["a@b.co"])).toEqual({ ok: false, error: "failed" });
    answer(401, { error: "unauthenticated" });
    expect(await inviteMembers(["a@b.co"])).toEqual({ ok: false, error: "signed-out" });
    answer(200, { nonsense: true });
    expect(await inviteMembers(["a@b.co"])).toEqual({ ok: false, error: "failed" });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    expect(await inviteMembers(["a@b.co"])).toEqual({ ok: false, error: "offline" });
  });

  it("resends one invite: whether it was emailed and when it now expires; or why not", async () => {
    const fetch = answer(200, { emailed: true, expiresAt: 1234 });
    expect(await resendMemberInvite(INVITE)).toEqual({ ok: true, emailed: true, expiresAt: 1234 });
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/account/members/invites/${INVITE}/resend`);
    answer(429, { error: "cooldown", retryAfterSeconds: 42 });
    expect(await resendMemberInvite(INVITE)).toEqual({
      ok: false,
      error: "cooldown",
      retryAfterSeconds: 42,
    });
    answer(429, { error: "rate-limited", retryAfterSeconds: 60, sentInWindow: 50, limit: 50 });
    expect(await resendMemberInvite(INVITE)).toMatchObject({
      error: "rate-limited",
      sentInWindow: 50,
    });
    answer(409, { error: "seats-full", used: 10, limit: 10 });
    expect(await resendMemberInvite(INVITE)).toMatchObject({ error: "seats-full" });
    answer(404, { error: "not-found" });
    expect(await resendMemberInvite(INVITE)).toEqual({ ok: false, error: "changed" });
    answer(403, { error: "not-allowed", permission: "members.manage" });
    expect(await resendMemberInvite(INVITE)).toEqual({ ok: false, error: "not-allowed" });
  });

  it("cancels one invite; a used or unknown one has changed", async () => {
    const fetch = answer(200, { ok: true });
    expect(await cancelMemberInvite(INVITE)).toEqual({ ok: true });
    expect(fetch.mock.calls.map(([path, init]) => [path, init?.method])).toEqual([
      [`/api/account/members/invites/${INVITE}`, "DELETE"],
    ]);
    answer(409, { error: "accepted" });
    expect(await cancelMemberInvite(INVITE)).toEqual({ ok: false, error: "changed" });
    answer(404, { error: "not-found" });
    expect(await cancelMemberInvite(INVITE)).toEqual({ ok: false, error: "changed" });
    answer(403, { error: "not-allowed", permission: "members.manage" });
    expect(await cancelMemberInvite(INVITE)).toEqual({ ok: false, error: "not-allowed" });
    answer(500, { error: "storage" });
    expect(await cancelMemberInvite(INVITE)).toEqual({ ok: false, error: "failed" });
  });
});

describe("invite refusal lines (4b.2)", () => {
  it("says how many seats are left now and how many addresses to take out", () => {
    expect(seatsFullMessage(2, 5)).toBe(
      "Nothing was sent. Only 2 seats are left now. Remove 3 addresses, then send again.",
    );
    expect(seatsFullMessage(1, 2)).toBe(
      "Nothing was sent. Only 1 seat is left now. Remove 1 address, then send again.",
    );
  });

  it("says how many emails went out and how long to wait, in minutes or hours", () => {
    expect(emailLimitMessage(50, 600)).toBe(
      "You've sent 50 invites in the last 24 hours. Try again in 10 minutes.",
    );
    expect(emailLimitMessage(1, 59)).toBe(
      "You've sent 1 invite in the last 24 hours. Try again in 1 minute.",
    );
    expect(waitLabel(0)).toBe("1 minute");
    expect(waitLabel(3600)).toBe("1 hour");
    expect(waitLabel(3601)).toBe("2 hours");
  });

  it("maps every invite refusal to its line", () => {
    const send = { kind: "invite", addresses: 4 } as const;
    const resend = { kind: "resend", email: "cleo@x.test" } as const;
    expect(membersErrorMessage("not-allowed", send, CONTEXT)).toBe(
      "You can no longer invite or remove people in Acme Studio. Ask Ana Ruiz if you need to.",
    );
    expect(
      membersErrorMessage("seats-full", send, CONTEXT, { seats: { used: 8, limit: 10 } }),
    ).toBe("Nothing was sent. Only 2 seats are left now. Remove 2 addresses, then send again.");
    expect(membersErrorMessage("seats-full", resend, CONTEXT)).toBe(
      "No seat is free, so this invite can't be renewed. Cancel another invite or remove someone, then try again.",
    );
    expect(
      membersErrorMessage("rate-limited", send, CONTEXT, {
        sentInWindow: 50,
        retryAfterSeconds: 7200,
      }),
    ).toBe("You've sent 50 invites in the last 24 hours. Try again in 2 hours.");
    expect(membersErrorMessage("changed", resend, CONTEXT)).toBe(
      "That invite has changed. The list is up to date now.",
    );
    expect(membersErrorMessage("offline", resend, CONTEXT)).toBe(
      "Couldn't reach Squint. Check your connection and try again.",
    );
  });
});

describe("membersErrorMessage", () => {
  const remove = { kind: "remove", name: "Ben Ito" } as const;
  const switches = { kind: "switches", name: "Ben Ito" } as const;

  it("names the owner, the workspace and the person (4b.0, 4b.2, 4b.5)", () => {
    expect(membersErrorMessage("owner-only", switches, CONTEXT)).toBe(
      "Only Ana Ruiz can change what people in Acme Studio can do.",
    );
    expect(membersErrorMessage("owner-only", remove, CONTEXT)).toBe(
      "Ana Ruiz owns Acme Studio, so nobody can remove them.",
    );
    expect(membersErrorMessage("not-allowed", remove, CONTEXT)).toBe(
      "You can no longer invite or remove people in Acme Studio. Ask Ana Ruiz if you need to.",
    );
    expect(membersErrorMessage("protected", remove, CONTEXT)).toBe(
      "Only Ana Ruiz can remove Ben Ito.",
    );
    expect(membersErrorMessage("gone", remove, CONTEXT)).toBe(
      "Ben Ito was already removed from Acme Studio. The list is up to date now.",
    );
    expect(membersErrorMessage("leaving", switches, CONTEXT)).toBe(
      "Ben Ito deleted their own account, so they're already leaving Acme Studio. The list is up to date now.",
    );
    expect(membersErrorMessage("offline", switches, CONTEXT)).toBe(
      "Couldn't save this change. Check your connection and try again.",
    );
    expect(membersErrorMessage("failed", switches, CONTEXT)).toBe(
      "Couldn't save this change. Try again in a moment.",
    );
    expect(membersErrorMessage("offline", remove, CONTEXT)).toBe(
      "Couldn't reach Squint. Check your connection and try again.",
    );
  });

  it("asks the workspace's owner when they have no name, and never uses an em dash", () => {
    const nameless = { ...CONTEXT, ownerName: null };
    expect(membersErrorMessage("owner-only", remove, nameless)).toBe(
      "Nobody can remove the owner of Acme Studio.",
    );
    expect(membersErrorMessage("owner-only", remove, { ...CONTEXT, ownerName: "  " })).toBe(
      "Nobody can remove the owner of Acme Studio.",
    );
    expect(membersErrorMessage("protected", remove, nameless)).toBe(
      "Only the workspace's owner can remove Ben Ito.",
    );
    const errors: MembersError[] = [
      "owner-only",
      "not-allowed",
      "protected",
      "gone",
      "leaving",
      "changed",
      "seats-full",
      "rate-limited",
      "cooldown",
      "signed-out",
      "offline",
      "failed",
    ];
    for (const error of errors) {
      for (const action of [remove, switches, ...INVITE_ACTIONS]) {
        expect(membersErrorMessage(error, action, CONTEXT)).not.toMatch(/—/);
      }
    }
  });
});
