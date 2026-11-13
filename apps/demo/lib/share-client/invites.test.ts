import { describe, expect, it } from "vitest";
import { inviteError, inviteResult, sendLabel, sentMessage, sentToLine } from "./invites";

const NOW = Date.UTC(2026, 10, 12, 9);
const refused = (status: number, error: string, body: unknown = { error }) =>
  ({ ok: false, status, error, body }) as const;

describe("a send's answer", () => {
  it("reads what went and the new count", () => {
    expect(inviteResult({ ok: true, value: { sent: 2, invitedCount: 5 } }, NOW)).toEqual({
      ok: true,
      sent: 2,
      invitedCount: 5,
    });
  });

  it("reads the refused addresses", () => {
    expect(
      inviteResult(
        refused(403, "members-only", { error: "members-only", addresses: ["a@b.co", 7] }),
        NOW,
      ),
    ).toEqual({ ok: false, reason: "members-only", addresses: ["a@b.co"] });
    expect(inviteResult(refused(400, "invalid-addresses", null), NOW)).toEqual({
      ok: false,
      reason: "invalid-addresses",
      addresses: [],
    });
  });

  it("waits as long as the server says", () => {
    expect(
      inviteResult(
        refused(429, "rate-limited", { error: "rate-limited", retryAfterSeconds: 600 }),
        NOW,
      ),
    ).toEqual({ ok: false, reason: "rate-limited", retryAt: NOW + 600_000 });
    expect(inviteResult(refused(429, "rate-limited", null), NOW, "120")).toEqual({
      ok: false,
      reason: "rate-limited",
      retryAt: NOW + 120_000,
    });
  });

  it("tells a closed review, an archived project, a gone link and a failure apart", () => {
    expect(inviteResult(refused(409, "review-closed"), NOW)).toEqual({
      ok: false,
      reason: "review-closed",
    });
    expect(inviteResult(refused(409, "link-closed"), NOW)).toEqual({ ok: false, reason: "closed" });
    expect(inviteResult(refused(404, "not-found"), NOW)).toEqual({ ok: false, reason: "gone" });
    expect(inviteResult(refused(502, "send-failed"), NOW)).toEqual({ ok: false, reason: "failed" });
    expect(inviteResult({ ok: false, status: 0, error: "offline" }, NOW)).toEqual({
      ok: false,
      reason: "failed",
    });
  });
});

describe("what the Share window says", () => {
  it("counts people and invites", () => {
    expect(sentToLine(0)).toBe("No invites sent yet");
    expect(sentToLine(1)).toBe("Sent to 1 person so far");
    expect(sentToLine(3)).toBe("Sent to 3 people so far");
    expect(sentMessage(1)).toBe("Invite sent to 1 person.");
    expect(sentMessage(2)).toBe("Invites sent to 2 people.");
    expect(sendLabel(0, false)).toBe("Send invites");
    expect(sendLabel(1, false)).toBe("Send 1 invite");
    expect(sendLabel(4, false)).toBe("Send 4 invites");
    expect(sendLabel(4, true)).toBe("Sending…");
  });

  it("says how long to wait, in whole minutes", () => {
    expect(inviteError({ ok: false, reason: "rate-limited", retryAt: 0 }, 61)).toBe(
      "You've sent a lot of invites this hour. Try again in 2 minutes.",
    );
    expect(inviteError({ ok: false, reason: "rate-limited", retryAt: 0 }, 5)).toBe(
      "You've sent a lot of invites this hour. Try again in 1 minute.",
    );
  });

  it("points a closed review to Settings", () => {
    expect(inviteError({ ok: false, reason: "review-closed" }, 0)).toMatch(
      /longer window or No limit in Settings/,
    );
  });
});
