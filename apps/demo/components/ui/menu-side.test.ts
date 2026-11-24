import { describe, expect, it } from "vitest";
import { chooseSide } from "./menu-side";

describe("chooseSide", () => {
  it("keeps the preferred side when the menu fits there", () => {
    expect(chooseSide("below", { above: 500, below: 200 }, 150)).toBe("below");
    expect(chooseSide("above", { above: 200, below: 500 }, 150)).toBe("above");
  });

  it("flips when only the other side has room", () => {
    expect(chooseSide("below", { above: 300, below: 40 }, 150)).toBe("above");
    expect(chooseSide("above", { above: 40, below: 300 }, 150)).toBe("below");
  });

  it("takes the side with more room when it fits neither, and the preferred on a tie", () => {
    expect(chooseSide("below", { above: 120, below: 30 }, 170)).toBe("above");
    expect(chooseSide("below", { above: 30, below: 120 }, 170)).toBe("below");
    expect(chooseSide("above", { above: 20, below: 90 }, 170)).toBe("below");
    expect(chooseSide("below", { above: 60, below: 60 }, 170)).toBe("below");
  });
});
