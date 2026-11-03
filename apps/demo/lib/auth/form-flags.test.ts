import { describe, expect, it } from "vitest";
import { loginFlagMessage, resetPasswordFlagMessage, resetRequestFlagMessage } from "./form-flags";

describe("form flags", () => {
  it("turns known codes into the forms' messages", () => {
    expect(loginFlagMessage("invalid-credentials")).toBe("Invalid email or password.");
    expect(loginFlagMessage("rate-limited", "840")).toBe(
      "Too many attempts. Try again in 14 minutes.",
    );
    expect(resetRequestFlagMessage("invalid-email")).toMatch(/name@company.com/);
    expect(resetPasswordFlagMessage("mismatch")).toMatch(/didn't match/);
  });

  it("ignores anything else, so the address can't put words on the page", () => {
    expect(loginFlagMessage(undefined)).toBeNull();
    expect(loginFlagMessage("<script>")).toBeNull();
    expect(resetRequestFlagMessage("toString")).toBeNull();
    expect(resetPasswordFlagMessage("constructor")).toBeNull();
  });
});
