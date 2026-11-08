import { describe, expect, it } from "vitest";
import { currentPasswordError, displayNameError, isCurrentEmail } from "./field-rules";
import {
  emailChangeSchema,
  emailConfirmSchema,
  passwordChangeSchema,
  profileSchema,
} from "./schemas";

const TOKEN = "A".repeat(43);

describe("account schemas", () => {
  it("takes a name of 1 to 80 characters once trimmed, and stores it trimmed", () => {
    expect(profileSchema.parse({ name: "  Ana Lima " })).toEqual({ name: "Ana Lima" });
    expect(profileSchema.parse({ name: "x".repeat(80) }).name).toHaveLength(80);
    // Characters, as Postgres counts them: 80 emoji fit, though they're 160 UTF-16 units.
    expect(profileSchema.safeParse({ name: "😀".repeat(80) }).success).toBe(true);
    for (const name of ["", "   ", "x".repeat(81), "😀".repeat(81), null, 7]) {
      expect(profileSchema.safeParse({ name }).success, String(name)).toBe(false);
    }
  });

  it("drops anything but the fields it knows, such as a user id", () => {
    expect(profileSchema.parse({ name: "Ana", userId: "someone-else" })).toEqual({ name: "Ana" });
  });

  it("needs the current password and a new one that keeps the password rules", () => {
    const ok = { currentPassword: "anything", newPassword: "twelve chars" };
    expect(passwordChangeSchema.parse(ok)).toEqual(ok);
    expect(passwordChangeSchema.safeParse({ ...ok, currentPassword: "" }).success).toBe(false);
    expect(passwordChangeSchema.safeParse({ ...ok, newPassword: "eleven char" }).success).toBe(
      false,
    );
    expect(passwordChangeSchema.safeParse({ ...ok, newPassword: "x".repeat(257) }).success).toBe(
      false,
    );
  });

  it("normalizes the new email, and needs the current password", () => {
    expect(
      emailChangeSchema.parse({ currentPassword: "pw", newEmail: "  New@Acme.TEST " }),
    ).toEqual({ currentPassword: "pw", newEmail: "new@acme.test" });
    expect(emailChangeSchema.safeParse({ currentPassword: "pw", newEmail: "nope" }).success).toBe(
      false,
    );
    expect(emailChangeSchema.safeParse({ currentPassword: "", newEmail: "a@b.test" }).success).toBe(
      false,
    );
  });

  it("takes a well-formed token only", () => {
    expect(emailConfirmSchema.safeParse({ token: TOKEN }).success).toBe(true);
    for (const token of ["short", `${TOKEN}A`, "x".repeat(42) + "!"]) {
      expect(emailConfirmSchema.safeParse({ token }).success).toBe(false);
    }
  });
});

describe("account field rules (the forms' checks on blur)", () => {
  it("say what's wrong with a name", () => {
    expect(displayNameError("  ")).toBe("Enter your name.");
    expect(displayNameError("x".repeat(81))).toBe("Use at most 80 characters.");
    expect(displayNameError(" Ana ")).toBeNull();
  });

  it("say what's wrong with the current password", () => {
    expect(currentPasswordError("")).toBe("Enter your current password.");
    expect(currentPasswordError("x".repeat(257))).toMatch(/at most 256/);
    expect(currentPasswordError(" short ")).toBeNull();
  });

  it("recognize the current address however it's typed", () => {
    expect(isCurrentEmail(" Ana@Acme.test ", "ana@acme.test")).toBe(true);
    expect(isCurrentEmail("bo@acme.test", "ana@acme.test")).toBe(false);
  });
});
