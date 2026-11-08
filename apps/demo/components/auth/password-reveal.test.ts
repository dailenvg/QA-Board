import { describe, expect, it } from "vitest";
import { withReveal } from "./password-reveal";

describe("withReveal", () => {
  it("counts each revealed field once, until every one is hidden again", () => {
    const none: ReadonlySet<string> = new Set();
    const one = withReveal(none, "new", true);
    const both = withReveal(one, "again", true);
    expect([...both]).toEqual(["new", "again"]);
    expect(withReveal(both, "new", true)).toBe(both);
    const left = withReveal(both, "new", false);
    expect([...left]).toEqual(["again"]);
    expect(withReveal(left, "again", false).size).toBe(0);
  });

  it("keeps the same set when nothing changes, so the panel doesn't re-render", () => {
    const none: ReadonlySet<string> = new Set();
    expect(withReveal(none, "a", false)).toBe(none);
  });
});
