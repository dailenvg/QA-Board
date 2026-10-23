import { beforeEach, describe, expect, it } from "vitest";
import { computeAnchor, fromPercent, resolveAnchor, toPercent } from "./anchor";

const viewport = { width: 1000, height: 800 };

function stubRect(
  element: Element,
  rect: { left: number; top: number; width: number; height: number },
) {
  element.getBoundingClientRect = () => ({
    ...rect,
    x: rect.left,
    y: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => rect,
  });
}

beforeEach(() => {
  document.body.innerHTML = `<section id="card"></section>`;
});

describe("percent math", () => {
  it("converts a coordinate to a percentage of a box", () => {
    expect(toPercent(150, 100, 200)).toBe(25);
    expect(toPercent(100, 100, 200)).toBe(0);
    expect(toPercent(300, 100, 200)).toBe(100);
  });

  it("clamps points outside the box", () => {
    expect(toPercent(50, 100, 200)).toBe(0);
    expect(toPercent(400, 100, 200)).toBe(100);
  });

  it("centres when the box has no size", () => {
    expect(toPercent(10, 10, 0)).toBe(50);
  });

  it("rounds to two decimals", () => {
    expect(toPercent(1, 0, 3)).toBe(33.33);
  });

  it("round-trips through fromPercent", () => {
    expect(fromPercent(toPercent(175, 100, 300), 100, 300)).toBe(175);
  });
});

describe("computeAnchor", () => {
  it("records the point relative to the element and the viewport", () => {
    const card = document.getElementById("card")!;
    stubRect(card, { left: 200, top: 100, width: 400, height: 200 });

    expect(computeAnchor(card, { x: 300, y: 150 }, viewport)).toEqual({
      selector: "#card",
      xPct: 25,
      yPct: 25,
      viewportXPct: 30,
      viewportYPct: 18.75,
    });
  });
});

describe("resolveAnchor", () => {
  const anchor = { selector: "#card", xPct: 25, yPct: 50, viewportXPct: 10, viewportYPct: 20 };

  it("follows the element when it moves", () => {
    const card = document.getElementById("card")!;
    stubRect(card, { left: 0, top: 0, width: 400, height: 200 });
    expect(resolveAnchor(anchor, viewport)).toEqual({ x: 100, y: 100, detached: false });

    stubRect(card, { left: 100, top: -50, width: 800, height: 200 });
    expect(resolveAnchor(anchor, viewport)).toEqual({ x: 300, y: 50, detached: false });
  });

  it("falls back to viewport percentages and marks the pin detached when the selector misses", () => {
    document.body.innerHTML = "";
    expect(resolveAnchor(anchor, viewport)).toEqual({ x: 100, y: 160, detached: true });
  });

  it("treats an element without a box (display: none) as detached", () => {
    stubRect(document.getElementById("card")!, { left: 0, top: 0, width: 0, height: 0 });
    expect(resolveAnchor(anchor, viewport).detached).toBe(true);
  });
});
