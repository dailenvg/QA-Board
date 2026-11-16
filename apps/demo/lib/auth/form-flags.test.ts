import { describe, expect, it } from "vitest";
import {
  emailChangeFlagMessage,
  joinFlagMessage,
  loginFlagMessage,
  type JoinFlag,
  loginNotice,
  resetPasswordFlagMessage,
  resetRequestFlagMessage,
} from "./form-flags";

describe("form flags", () => {
  it("turns known codes into the forms' messages", () => {
    expect(loginFlagMessage("invalid-credentials")).toBe(
      "Invalid email or password. Check both and try again, or reset your password.",
    );
    expect(loginFlagMessage("removed")).toBe(
      "You're no longer in a Squint workspace, so you can't sign in. Ask the person who invited you for a new invite.",
    );
    expect(loginFlagMessage("rate-limited", "840")).toBe(
      "Too many attempts. Try again in 14 minutes.",
    );
    expect(resetRequestFlagMessage("invalid-email")).toMatch(/name@company.com/);
    expect(resetPasswordFlagMessage("mismatch")).toMatch(/didn't match/);
    expect(emailChangeFlagMessage("taken")).toMatch(/Another account/);
    expect(joinFlagMessage("mismatch")).toBe("The two passwords didn't match. Type them again.");
    expect(joinFlagMessage("invalid")).toBe(
      "Enter your name and a password of 12 to 256 characters.",
    );
  });

  it("has a message for every way a join form post comes back, none naming anyone", () => {
    const flags: JoinFlag[] = [
      "invalid",
      "mismatch",
      "rate-limited",
      "unavailable",
      "not-found",
      "expired",
      "cancelled",
      "used",
      "seats-full",
      "wrong-account",
      "cannot-join",
      "in-another-workspace",
      "sign-in-first",
      "account-closing",
    ];
    for (const flag of flags) {
      const message = joinFlagMessage(flag);
      expect(message, flag).toMatch(/\.$/);
      expect(message, flag).not.toMatch(/—|\{/);
    }
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
    expect(joinFlagMessage("__proto__")).toBeNull();
    expect(joinFlagMessage(undefined)).toBeNull();
  });
});
