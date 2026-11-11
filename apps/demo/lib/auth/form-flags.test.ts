import { describe, expect, it } from "vitest";
import {
  emailChangeFlagMessage,
  loginFlagMessage,
  loginNotice,
  resetPasswordFlagMessage,
  resetRequestFlagMessage,
} from "./form-flags";

describe("form flags", () => {
  it("turns known codes into the forms' messages", () => {
    expect(loginFlagMessage("invalid-credentials")).toBe(
      "Invalid email or password. Check both and try again, or reset your password.",
    );
    expect(loginFlagMessage("rate-limited", "840")).toBe(
      "Too many attempts. Try again in 14 minutes.",
    );
    expect(resetRequestFlagMessage("invalid-email")).toMatch(/name@company.com/);
    expect(resetPasswordFlagMessage("mismatch")).toMatch(/didn't match/);
    expect(emailChangeFlagMessage("taken")).toMatch(/Another account/);
  });

  it("says why the sign-in page was opened, after a reset, an email change or a sign-out", () => {
    expect(loginNotice({ reset: "done" })).toMatch(/Password changed/);
    expect(loginNotice({ email: "changed" })).toMatch(/Email changed/);
    expect(loginNotice({ signedOut: "everywhere" })).toMatch(/every device/);
    expect(loginNotice({ account: "deleted" })).toMatch(/scheduled for deletion/);
    expect(loginNotice({ reset: "x", email: "y", signedOut: "z", account: "w" })).toBeNull();
  });

  it("ignores anything else, so the address can't put words on the page", () => {
    expect(loginFlagMessage(undefined)).toBeNull();
    expect(loginFlagMessage("<script>")).toBeNull();
    expect(resetRequestFlagMessage("toString")).toBeNull();
    expect(resetPasswordFlagMessage("constructor")).toBeNull();
    expect(emailChangeFlagMessage("hasOwnProperty")).toBeNull();
  });
});
