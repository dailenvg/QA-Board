import { afterEach, describe, expect, it, vi } from "vitest";
import {
  membersErrorMessage,
  removeMember,
  saveMemberSwitches,
  type MembersError,
} from "./members-client";

const USER = "00000000-0000-4000-8000-000000000001";
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
      "signed-out",
      "offline",
      "failed",
    ];
    for (const error of errors) {
      for (const action of [remove, switches]) {
        expect(membersErrorMessage(error, action, CONTEXT)).not.toMatch(/—/);
      }
    }
  });
});
