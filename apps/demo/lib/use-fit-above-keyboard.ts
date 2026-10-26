import { useEffect, useRef, type RefObject } from "react";

/** Gap kept between a popup and the keyboard (or the screen's bottom edge), in px. */
const GAP = 12;
/** Never shorter than this, in px: room for a couple of results even on a squeezed screen. */
const MIN_HEIGHT = 120;

/**
 * How tall a popup whose top is at `top` may be, in px, to end above `visibleBottom`: the
 * visual viewport's bottom edge, which an on-screen keyboard raises.
 */
export function roomAboveKeyboard(top: number, visibleBottom: number): number {
  return Math.max(MIN_HEIGHT, Math.floor(visibleBottom - top - GAP));
}

/**
 * While `active`, caps the height of the element given the returned ref, so it ends above an
 * on-screen keyboard: phones shrink the visual viewport, not the layout one, so CSS viewport
 * units don't see the keyboard. Follows the keyboard as it opens, closes and resizes. `cssMax`
 * is the cap CSS would apply anyway.
 */
export function useFitAboveKeyboard<T extends HTMLElement>(
  active: boolean,
  cssMax: string,
): RefObject<T | null> {
  const element = useRef<T>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const node = element.current;
    if (!active || !viewport || !node) return;
    const fit = () => {
      const top = node.getBoundingClientRect().top;
      const room = roomAboveKeyboard(top, viewport.offsetTop + viewport.height);
      node.style.maxHeight = `min(${cssMax}, ${room}px)`;
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
      node.style.maxHeight = "";
    };
  }, [active, cssMax]);
  return element;
}
