import { describe, expect, it } from "vitest";
import { pinNumbers, pinOrder, pinTag } from "./pin-numbers";
import type { Comment } from "./types";

const comment = (id: string, teamOnly = false): Comment => ({
  id,
  projectId: "p1",
  x: 1,
  y: 1,
  body: "Hi",
  author: "Ana",
  status: "active",
  createdAt: 1,
  updatedAt: 1,
  ...(teamOnly ? { teamOnly: true as const } : {}),
});

describe("pinNumbers (D13)", () => {
  it("numbers clients' comments 1..n and the team's T1..Tn, each in creation order", () => {
    const numbers = pinNumbers([
      comment("a"),
      comment("b", true),
      comment("c"),
      comment("d", true),
      comment("e"),
    ]);
    expect([...numbers].map(([id, pin]) => [id, pin.label])).toEqual([
      ["a", "1"],
      ["b", "T1"],
      ["c", "2"],
      ["d", "T2"],
      ["e", "3"],
    ]);
    expect(numbers.get("d")).toEqual({ number: 2, teamOnly: true, label: "T2" });
  });

  it("keeps the numbers clients see when a comment is kept to the team", () => {
    const shown = pinNumbers([comment("a"), comment("b"), comment("c")]);
    const hidden = pinNumbers([comment("a"), comment("b", true), comment("c")]);
    expect(shown.get("c")?.label).toBe("3");
    // A guest numbers only the link's comments: "c" is 2 for them, and now for the team too.
    expect(hidden.get("c")?.label).toBe("2");
    expect(hidden.get("b")?.label).toBe("T1");
  });

  it("tags a number, and orders pins by creation across both sequences", () => {
    expect(pinTag(4, false)).toBe("4");
    expect(pinTag(1, true)).toBe("T1");
    expect([...pinOrder([comment("a", true), comment("b")])]).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
  });
});
