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

/**
 * How much of the layout viewport's bottom an on-screen keyboard covers, in px: what lies below
 * the visual viewport (`visibleTop` + `visibleHeight`); 0 without a keyboard.
 */
export function keyboardOverlap(
  layoutHeight: number,
  visibleTop: number,
  visibleHeight: number,
): number {
  return Math.max(0, Math.round(layoutHeight - (visibleTop + visibleHeight)));
}

/**
 * While `active`, lifts a bottom-anchored overlay (the returned `container`, such as a dialog's
 * backdrop grid) above an on-screen keyboard and caps its `panel` to the part of the screen left
 * visible, so a field inside stays in sight while it's typed in. Without a keyboard both keep
 * their CSS.
 */
export function useLiftAboveKeyboard<C extends HTMLElement, P extends HTMLElement>(
  active: boolean,
): { container: RefObject<C | null>; panel: RefObject<P | null> } {
  const container = useRef<C>(null);
  const panel = useRef<P>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const box = container.current;
    const sheet = panel.current;
    if (!active || !viewport || !box || !sheet) return;
    const fit = () => {
      const covered = keyboardOverlap(window.innerHeight, viewport.offsetTop, viewport.height);
      box.style.paddingBottom = covered ? `${covered + GAP}px` : "";
      sheet.style.maxHeight = covered ? `${Math.max(MIN_HEIGHT, viewport.height - 2 * GAP)}px` : "";
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
      box.style.paddingBottom = "";
      sheet.style.maxHeight = "";
    };
  }, [active]);
  return { container, panel };
}
