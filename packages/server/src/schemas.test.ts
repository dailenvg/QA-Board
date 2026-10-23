import { describe, expect, it } from "vitest";
import { pathSchema } from "./schemas";

describe("pathSchema", () => {
  it.each(["/", "/pricing", "/pricing?x=1", "/blog/héllo", "/%E2%9C%93", "/..//evil.example"])(
    "accepts %j",
    (path) => {
      expect(pathSchema.safeParse(path).success).toBe(true);
    },
  );

  it.each([
    ["protocol-relative", "//evil.example"],
    ["backslash-relative", "/\\evil.example"],
    ["inner backslash", "/a\\b"],
    ["whitespace", "/a b"],
    ["C0 control U+0001", "/a\u0001b"],
    ["DEL U+007F", "/a\u007fb"],
    ["C1 control U+0085", "/a\u0085b"],
    ["C1 control U+009F", "/a\u009fb"],
    ["no leading slash", "pricing"],
    ["empty", ""],
  ])("rejects %s", (_label, path) => {
    expect(pathSchema.safeParse(path).success).toBe(false);
  });
});
