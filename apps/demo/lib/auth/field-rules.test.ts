import { describe, expect, it } from "vitest";
import {
  confirmPasswordError,
  emailError,
  newPasswordError,
  normalizeEmail,
  passwordError,
} from "./field-rules";

describe("auth field rules", () => {
  it("normalizes emails by trimming and lowercasing", () => {
    expect(normalizeEmail("  Ana@Example.COM ")).toBe("ana@example.com");
  });

  it("asks for an email, then for one that looks like an address", () => {
    expect(emailError("")).toBe("Enter your email address.");
    expect(emailError("ana")).toMatch(/like name@company.com/);
    expect(emailError("ana@example")).toMatch(/like name@company.com/);
    expect(emailError(" ana@example.com ")).toBeNull();
  });

  it("asks for a password on sign-in, of any length up to the cap", () => {
    expect(passwordError("")).toBe("Enter your password.");
    expect(passwordError("short")).toBeNull();
    expect(passwordError("x".repeat(257))).toMatch(/at most 256/);
  });

  it("wants new passwords of 12 to 256 characters, typed twice", () => {
    expect(newPasswordError("")).toBe("Choose a new password.");
    expect(newPasswordError("x".repeat(11))).toBe("Use at least 12 characters.");
    expect(newPasswordError("x".repeat(12))).toBeNull();
    expect(newPasswordError("x".repeat(257))).toBe("Use at most 256 characters.");
    expect(confirmPasswordError("a".repeat(12), "")).toMatch(/again/);
    expect(confirmPasswordError("a".repeat(12), "b".repeat(12))).toMatch(/don't match/);
    expect(confirmPasswordError("a".repeat(12), "a".repeat(12))).toBeNull();
  });
});
