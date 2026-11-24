import { useEffect, useRef, type RefObject } from "react";

/** Gap kept between a popup and the keyboard (or the screen's bottom edge), in px. */
const GAP = 12;
/** Never shorter than this, in px: room for a couple of results even on a squeezed screen. */
const MIN_HEIGHT = 120;
/** Elements a phone's keyboard opens for. */
const TYPED = "input, textarea, select, [contenteditable]";

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

/** Lifts a docked panel `covered` px (0: back to its CSS), capped to `cssMax` or what's visible. */
function dockAbove(node: HTMLElement, covered: number, visible: number, cssMax: string): void {
  node.style.bottom = covered ? `${covered + GAP}px` : "";
  node.style.maxHeight = covered
    ? `min(${cssMax}, ${Math.max(MIN_HEIGHT, visible - 2 * GAP)}px)`
    : "";
}

/**
 * While `active`, keeps a `position: fixed` panel docked to the bottom of the screen (`dock`,
 * such as the pin's popover on a phone) above an on-screen keyboard: its bottom edge lifted past
 * the part of the layout viewport the keyboard covers, and its height capped to `cssMax` or to
 * what's left visible, whichever is less. Without a keyboard it keeps its CSS.
 */
export function useDockAboveKeyboard(
  dock: RefObject<HTMLElement | null>,
  active: boolean,
  cssMax: string,
): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    const node = dock.current;
    if (!active || !viewport || !node) return;
    const fit = () =>
      dockAbove(
        node,
        keyboardOverlap(window.innerHeight, viewport.offsetTop, viewport.height),
        viewport.height,
        cssMax,
      );
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
      dockAbove(node, 0, viewport.height, cssMax);
    };
  }, [dock, active, cssMax]);
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
    let frame = 0;
    const fit = (): number => {
      const covered = keyboardOverlap(window.innerHeight, viewport.offsetTop, viewport.height);
      box.style.paddingBottom = covered ? `${covered + GAP}px` : "";
      sheet.style.maxHeight = covered ? `${Math.max(MIN_HEIGHT, viewport.height - 2 * GAP)}px` : "";
      return covered;
    };
    // Cut shorter as the keyboard opens, the sheet may scroll the field being typed in out of
    // sight: bring it back. On resize only (the keyboard opening or changing height), never on
    // scroll, which would fight the user's own.
    const refit = () => {
      if (!fit()) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const field = document.activeElement;
        if (field instanceof HTMLElement && sheet.contains(field) && field.matches(TYPED)) {
          field.scrollIntoView({ block: "nearest" });
        }
      });
    };
    fit();
    viewport.addEventListener("resize", refit);
    viewport.addEventListener("scroll", fit);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", refit);
      viewport.removeEventListener("scroll", fit);
      box.style.paddingBottom = "";
      sheet.style.maxHeight = "";
    };
  }, [active]);
  return { container, panel };
}
