import { describe, expect, it } from "vitest";
import {
  can,
  DEFAULT_SWITCHES,
  defaultPermission,
  knownSwitches,
  MEMBER_SWITCHES,
  refusalFor,
  SWITCH_FOR,
  type Access,
  type Permission,
  type SwitchPermission,
} from "./permissions";
import MATRIX from "./permissions-matrix.json";

const EVERY_MEMBER: Permission[] = ["workspace.read", "workspace.write"];
const OWNER_ONLY: Permission[] = ["workspace.manage", "members.permissions", "comment.moderate"];
const SWITCHED = Object.keys(SWITCH_FOR) as SwitchPermission[];
const ALL: Permission[] = [...EVERY_MEMBER, ...SWITCHED, ...OWNER_ONLY];

const owner: Access = { role: "owner", permissions: [] };
const member = (permissions: Access["permissions"]): Access => ({ role: "member", permissions });

describe("can", () => {
  it("lets the owner do everything, whatever their row's switches say", () => {
    for (const permission of ALL) expect(can(owner, permission), permission).toBe(true);
  });

  it("lets every member read and write the workspace, with no switch at all", () => {
    for (const permission of EVERY_MEMBER) expect(can(member([]), permission)).toBe(true);
  });

  it("never lets a member do what only the owner may, with every switch on", () => {
    for (const permission of OWNER_ONLY) {
      expect(can(member(MEMBER_SWITCHES), permission), permission).toBe(false);
    }
  });

  it.each(SWITCHED)("lets a member %s only with its switch on", (permission) => {
    const on = SWITCH_FOR[permission];
    expect(can(member([on]), permission)).toBe(true);
    expect(can(member(MEMBER_SWITCHES.filter((value) => value !== on)), permission)).toBe(false);
  });

  it("gives a new member everything but inviting and removing people", () => {
    const fresh = member(DEFAULT_SWITCHES);
    expect(SWITCHED.filter((permission) => can(fresh, permission))).toEqual([
      "links.manage",
      "projects.trash",
      "workspace.import",
    ]);
  });
});

/**
 * `can`'s every answer, captured from its implementation before Better Auth's
 * access control (origin/main 84b3167): both roles, each of the 16 sets of
 * switches, every permission; and switch lists holding values no row should
 * (a role's name), which must never read as that role.
 */
describe("can, against its answers from before Better Auth", () => {
  const subsets = MATRIX.cases.filter(({ permissions }) =>
    permissions.every((value) => (MEMBER_SWITCHES as readonly string[]).includes(value)),
  );

  it("covers both roles, all 16 sets of switches and every permission", () => {
    expect([...MATRIX.permissions].sort()).toEqual([...ALL].sort());
    for (const role of ["owner", "member"]) {
      const sets = subsets.filter((entry) => entry.role === role);
      expect(new Set(sets.map(({ permissions }) => permissions.join())).size).toBe(16);
    }
  });

  it.each(MATRIX.cases)("answers as before for $role with [$permissions]", (entry) => {
    const access = { role: entry.role, permissions: entry.permissions } as Access;
    const answers = Object.fromEntries(
      ALL.map((permission) => [permission, can(access, permission)]),
    );
    expect(answers).toEqual(entry.allowed);
  });
});

describe("refusalFor", () => {
  it("answers 403 owner-only for the owner's own, and not-allowed naming a switch's", async () => {
    const ownerOnly = refusalFor(member(MEMBER_SWITCHES), "workspace.manage");
    expect(ownerOnly?.status).toBe(403);
    expect(await ownerOnly?.json()).toEqual({ error: "owner-only" });
    const switched = refusalFor(member([]), "projects.trash");
    expect(switched?.status).toBe(403);
    expect(await switched?.json()).toEqual({ error: "not-allowed", permission: "projects.trash" });
    expect(refusalFor(member([]), "workspace.write")).toBeNull();
    expect(refusalFor(owner, "comment.moderate")).toBeNull();
  });
});

describe("defaults and rows", () => {
  it("reads on a GET and writes on anything else", () => {
    expect(defaultPermission("GET")).toBe("workspace.read");
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(defaultPermission(method)).toBe("workspace.write");
    }
  });

  it("keeps only the switches it knows, in one order", () => {
    expect(knownSwitches(["people", "admin", "trash"])).toEqual(["trash", "people"]);
    expect(knownSwitches(null)).toEqual([]);
  });
});
