import { describe, expect, it } from "vitest";
import { cappedHeight, chooseSide, MIN_CAPPED_HEIGHT } from "./menu-side";

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

describe("cappedHeight", () => {
  it("leaves a menu that fits on its side uncapped", () => {
    expect(cappedHeight("below", { above: 50, below: 400 }, 300, 12)).toBeNull();
    expect(cappedHeight("above", { above: 300, below: 0 }, 300, 12)).toBeNull();
  });

  it("caps one that doesn't to the room on its side, less the margin", () => {
    expect(cappedHeight("above", { above: 250.6, below: 120 }, 400, 12)).toBe(238);
    expect(cappedHeight("below", { above: 100, below: 300 }, 400, 12)).toBe(288);
  });

  it("never caps below about three items, so it still reads as a menu", () => {
    expect(cappedHeight("below", { above: 40, below: 90 }, 400, 12)).toBe(MIN_CAPPED_HEIGHT);
    expect(cappedHeight("below", { above: 0, below: 0 }, 400, 12)).toBe(MIN_CAPPED_HEIGHT);
  });
});
