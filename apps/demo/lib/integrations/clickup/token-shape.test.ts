import { describe, expect, it } from "vitest";
import { cleanClickUpToken, isClickUpTokenShape } from "./token-shape";

const TOKEN = `pk_81234567_${"AB12".repeat(8)}`;

describe("a ClickUp personal token's shape", () => {
  it("is pk_, the user's id, then 32 letters and digits", () => {
    expect(isClickUpTokenShape(TOKEN)).toBe(true);
    expect(isClickUpTokenShape(`pk_1_${"a".repeat(32)}`)).toBe(true);
  });

  it("forgives the spaces and line breaks a copy brings along", () => {
    expect(cleanClickUpToken(` ${TOKEN}\n`)).toBe(TOKEN);
    expect(isClickUpTokenShape(`  ${TOKEN.slice(0, 10)} ${TOKEN.slice(10)}\t`)).toBe(true);
  });

  it("refuses anything else", () => {
    for (const token of [
      "",
      TOKEN.slice(0, -1),
      `${TOKEN}A`,
      TOKEN.replace("pk_", "sk_"),
      TOKEN.replace("pk_81234567", "pk_abc"),
      `pk_81234567_${"A".repeat(31)}-`,
      `Bearer ${TOKEN}`,
    ]) {
      expect(isClickUpTokenShape(token), token).toBe(false);
    }
  });
});
