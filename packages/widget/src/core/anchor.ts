import { clamp, type Point, type Size } from "./geometry";
import { generateSelector, resolveSelector } from "./selector";
import type { PinAnchor } from "./types";

export interface ResolvedPosition extends Point {
  /** True when the anchor element is gone or has no box; position is viewport-relative. */
  detached: boolean;
}

/** Position of `value` within `[start, start + size]` as a 0-100 percentage. */
export function toPercent(value: number, start: number, size: number): number {
  if (size <= 0) return 50;
  const pct = clamp(((value - start) / size) * 100, 0, 100);
  return Math.round(pct * 100) / 100;
}

export function fromPercent(pct: number, start: number, size: number): number {
  return start + (size * pct) / 100;
}

/** Builds an anchor for a point (viewport coordinates) on `element`. */
export function computeAnchor(element: Element, point: Point, viewport: Size): PinAnchor {
  const rect = element.getBoundingClientRect();
  return {
    selector: generateSelector(element),
    xPct: toPercent(point.x, rect.left, rect.width),
    yPct: toPercent(point.y, rect.top, rect.height),
    viewportXPct: toPercent(point.x, 0, viewport.width),
    viewportYPct: toPercent(point.y, 0, viewport.height),
  };
}

/** Resolves an anchor to viewport coordinates, falling back to viewport % when detached. */
export function resolveAnchor(
  anchor: PinAnchor,
  viewport: Size,
  root: Document = document,
): ResolvedPosition {
  const rect = resolveSelector(anchor.selector, root)?.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    return {
      x: fromPercent(anchor.viewportXPct, 0, viewport.width),
      y: fromPercent(anchor.viewportYPct, 0, viewport.height),
      detached: true,
    };
  }
  return {
    x: fromPercent(anchor.xPct, rect.left, rect.width),
    y: fromPercent(anchor.yPct, rect.top, rect.height),
    detached: false,
  };
}
