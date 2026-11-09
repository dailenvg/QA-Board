import { describe, expect, it } from "vitest";
import {
  brandColorError,
  currentPasswordError,
  displayNameError,
  isCurrentEmail,
  normalizeBrandColor,
  normalizeSenderName,
  senderNameError,
  workspaceNameError,
} from "./field-rules";
import {
  emailChangeSchema,
  emailConfirmSchema,
  passwordChangeSchema,
  profileSchema,
  workspaceSettingsSchema,
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

describe("workspace settings schema", () => {
  const ok = { name: "ONE Agency", brandColor: "#1157ce", senderName: "ONE Creative" };

  it("takes the name trimmed, the color lowercased and the sender name with spaces collapsed", () => {
    expect(
      workspaceSettingsSchema.parse({
        name: "  ONE Agency ",
        brandColor: "#1157CE",
        senderName: "  ONE   Creative ",
      }),
    ).toEqual(ok);
  });

  it("takes null (or a blank sender name) for the defaults", () => {
    expect(workspaceSettingsSchema.parse({ ...ok, brandColor: null, senderName: null })).toEqual({
      ...ok,
      brandColor: null,
      senderName: null,
    });
    expect(workspaceSettingsSchema.parse({ ...ok, senderName: "   " }).senderName).toBeNull();
  });

  it("drops anything but its fields, such as a workspace id or slug", () => {
    expect(workspaceSettingsSchema.parse({ ...ok, workspaceId: "other", slug: "x" })).toEqual(ok);
  });

  it("refuses a name outside 1 to 80 characters", () => {
    for (const name of ["", "   ", "x".repeat(81), null]) {
      expect(workspaceSettingsSchema.safeParse({ ...ok, name }).success, String(name)).toBe(false);
    }
  });

  it("refuses a color that isn't #rrggbb, or that's too light to stand out on white", () => {
    for (const brandColor of ["1157ce", "#15c", "#1157cg", "blue", "", "#e1fd73", "#ffffff"]) {
      const parsed = workspaceSettingsSchema.safeParse({ ...ok, brandColor });
      expect(parsed.success, brandColor).toBe(false);
    }
  });

  it("refuses a sender name over 64 characters or with what a From header can't carry", () => {
    for (const senderName of ["x".repeat(65), 'ONE "Creative"', "a@b.test", "<ONE>", "tick`"]) {
      const parsed = workspaceSettingsSchema.safeParse({ ...ok, senderName });
      expect(parsed.success, senderName).toBe(false);
    }
    expect(
      workspaceSettingsSchema.safeParse({ ...ok, senderName: "Dailen's Studio" }).success,
    ).toBe(true);
  });
});

describe("workspace field rules", () => {
  it("normalizes a typed color to lowercase #rrggbb, three digits or six, # or not", () => {
    expect(normalizeBrandColor("#ABC")).toBe("#aabbcc");
    expect(normalizeBrandColor(" 1157CE ")).toBe("#1157ce");
    expect(normalizeBrandColor("#1157c")).toBeNull();
    expect(normalizeBrandColor("")).toBeNull();
  });

  it("explains a color it can't use, and lets a blank one through", () => {
    expect(brandColorError("")).toBeNull();
    expect(brandColorError("#1157ce")).toBeNull();
    expect(brandColorError("nope")).toMatch(/hex color/);
    expect(brandColorError("#fafafa")).toMatch(/too light/);
  });

  it("explains a workspace name or sender name it can't use", () => {
    expect(workspaceNameError(" ")).toMatch(/name/);
    expect(workspaceNameError("x".repeat(81))).toMatch(/80/);
    expect(senderNameError("")).toBeNull();
    expect(senderNameError("x".repeat(65))).toMatch(/64/);
    expect(senderNameError("Acme <ceo@acme.test>")).toMatch(/angle brackets/);
    expect(normalizeSenderName("  Acme \n Studio ")).toBe("Acme Studio");
  });
});
