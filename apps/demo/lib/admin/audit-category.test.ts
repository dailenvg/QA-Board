import { describe, expect, it } from "vitest";
import { auditCategory } from "./audit-category";

describe("auditCategory", () => {
  it.each([
    ["user.name_changed", "account"],
    ["user.password_reset", "account"],
    ["workspace.settings_changed", "workspace"],
    ["membership.added", "people"],
    ["member.invited", "people"],
    ["project.clickup_sent", "projects"],
    ["share.invites_sent", "reviewLinks"],
    ["seed.user_created", "other"],
    ["toString.x", "other"],
    ["", "other"],
  ])("files %s under %s", (action, category) => {
    expect(auditCategory(action)).toBe(category);
  });
});
