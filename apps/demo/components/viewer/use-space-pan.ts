import { useEffect, useState, type RefObject } from "react";
import { lastInputWasKeyboard } from "@/lib/last-input";
import { isTyping } from "@/lib/use-shortcut";
import { canArmPan, spacePresses, type SpaceTarget } from "./space-pan";

/** The zoom control (`ZoomControl`): its buttons, once clicked, leave Space to Space-drag. */
const ZOOM_CONTROL = "[data-zoom-control]";

/** Space-drag: off, armed (Space held over a surface that overflows), or dragging. */
export type PanState = "off" | "armed" | "dragging";

interface Drag {
  pointerId: number;
  x: number;
  y: number;
  scrollLeft: number;
  scrollTop: number;
}

const isSpace = (event: KeyboardEvent) => event.key === " " || event.code === "Space";

function spaceTarget(event: Event): SpaceTarget | null {
  const target = event.composedPath()[0];
  return target instanceof Element
    ? { tagName: target.tagName, role: target.getAttribute("role") }
    : null;
}

function inside(point: { x: number; y: number }, box: DOMRect): boolean {
  return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
}

/**
 * Swallows the click a drag ends with, wherever the pointer comes up, so it places no pin and
 * presses nothing. The click follows the pointerup in the same task, so a timeout after the
 * pointerup outlives it, and a drag that ends without a click leaves nothing behind.
 */
function swallowNextClick(): void {
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const done = () => {
    window.removeEventListener("pointerup", done, true);
    window.removeEventListener("pointercancel", done, true);
    window.setTimeout(() => window.removeEventListener("click", swallow, true), 0);
  };
  window.addEventListener("click", swallow, true);
  window.addEventListener("pointerup", done, true);
  window.addEventListener("pointercancel", done, true);
}

/**
 * Hold Space and drag to move around a surface bigger than the stage (`scroller`). Space arms
 * it only over the surface (`surface`), with focus out of text fields and off anything Space
 * presses (`canArmPan`); a drag captures the pointer and scrolls the stage. Releasing Space,
 * leaving the window or a cancelled pointer lets go. The zoom control's buttons only keep Space
 * while they took focus from the keyboard: clicked (or the level menu's trigger, back from a
 * clicked item), a mouse user there wants the hand, where one who tabbed there wants Space to
 * press them.
 */
export function useSpacePan(
  scroller: RefObject<HTMLElement | null>,
  surface: RefObject<HTMLElement | null>,
  enabled: boolean,
): PanState {
  const [state, setState] = useState<PanState>("off");

  useEffect(() => {
    const area = scroller.current;
    if (!enabled || !area) return;
    let pointer: { x: number; y: number } | null = null;
    let armed = false;
    let drag: Drag | null = null;
    /** A zoom control button that took focus from a pointer rather than the keyboard. */
    let clickFocused: EventTarget | null = null;

    const overSurface = () => {
      const node = surface.current;
      if (!pointer || !node) return false;
      return (
        inside(pointer, node.getBoundingClientRect()) &&
        inside(pointer, area.getBoundingClientRect())
      );
    };
    const overflows = () =>
      area.scrollWidth > area.clientWidth + 1 || area.scrollHeight > area.clientHeight + 1;

    const endDrag = () => {
      if (!drag) return;
      if (area.hasPointerCapture(drag.pointerId)) area.releasePointerCapture(drag.pointerId);
      drag = null;
      setState(armed ? "armed" : "off");
    };
    const disarm = () => {
      armed = false;
      endDrag();
      setState("off");
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSpace(event) || event.metaKey || event.ctrlKey || event.altKey) return;
      // Held: its repeats mustn't scroll the stage or reach a control.
      if (armed) {
        event.preventDefault();
        return;
      }
      if (event.repeat) return;
      const target = event.composedPath()[0] ?? null;
      const arm = canArmPan({
        typing: isTyping(target),
        pressing: target !== clickFocused && spacePresses(spaceTarget(event)),
        modalOpen: Boolean(document.querySelector('[aria-modal="true"]')),
        overflows: overflows(),
        overSurface: overSurface(),
      });
      if (!arm) return;
      event.preventDefault();
      armed = true;
      setState("armed");
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!armed || !isSpace(event)) return;
      event.preventDefault();
      disarm();
    };
    const onFocusIn = ({ target }: FocusEvent) => {
      const zoomButton = target instanceof Element && target.closest(ZOOM_CONTROL);
      clickFocused = zoomButton && !lastInputWasKeyboard() ? target : null;
    };
    const onPointerMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      if (!drag || event.pointerId !== drag.pointerId) return;
      area.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
      area.scrollTop = drag.scrollTop - (event.clientY - drag.y);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!armed || drag || event.button !== 0) return;
      // No text selection, and focus stays where it was (the comment canvas, for one).
      event.preventDefault();
      area.setPointerCapture(event.pointerId);
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        scrollLeft: area.scrollLeft,
        scrollTop: area.scrollTop,
      };
      swallowNextClick();
      setState("dragging");
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", disarm);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("focusin", onFocusIn);
    area.addEventListener("pointerdown", onPointerDown);
    area.addEventListener("pointerup", endDrag);
    area.addEventListener("pointercancel", endDrag);
    area.addEventListener("lostpointercapture", endDrag);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", disarm);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("focusin", onFocusIn);
      area.removeEventListener("pointerdown", onPointerDown);
      area.removeEventListener("pointerup", endDrag);
      area.removeEventListener("pointercancel", endDrag);
      area.removeEventListener("lostpointercapture", endDrag);
      disarm();
    };
  }, [scroller, surface, enabled]);

  return state;
}
