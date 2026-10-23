import { useEffect, useRef, useState } from "react";
import {
  centerOf,
  elementAtPoint,
  initialKeyboardTarget,
  isFromHost,
  isWalkKey,
  walkElement,
} from "../../core/dom";
import { createFrameScheduler } from "../../core/frame-scheduler";
import type { Point } from "../../core/geometry";
import { useLatest } from "./use-latest";

export type TargetSource = "pointer" | "keyboard";

export interface CommentTarget {
  element: Element;
  source: TargetSource;
}

interface CommentModeOptions {
  active: boolean;
  host: HTMLElement;
  onPick: (element: Element, point: Point) => void;
}

const CURSOR_STYLE_ATTRIBUTE = "data-pinpoint-cursor";
const BLOCKED_POINTER_EVENTS = [
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "dblclick",
  "auxclick",
] as const;

/** Crosshair over the whole page via a removable stylesheet; no host element is touched. */
function injectCursorStyle(): () => void {
  const style = document.createElement("style");
  style.setAttribute(CURSOR_STYLE_ATTRIBUTE, "");
  style.textContent = "html, html * { cursor: crosshair !important; }";
  document.head.append(style);
  return () => style.remove();
}

/**
 * Comment mode: tracks the element under the pointer (or chosen with the
 * keyboard) and turns the next click or Enter into a pin. Page clicks are
 * swallowed in the capture phase so links and buttons do not fire.
 */
export function useCommentMode({ active, host, onPick }: CommentModeOptions): CommentTarget | null {
  const [target, setTarget] = useState<CommentTarget | null>(null);
  const targetRef = useRef<CommentTarget | null>(null);
  const pick = useLatest(onPick);

  useEffect(() => {
    if (!active) return;

    const update = (next: CommentTarget | null) => {
      targetRef.current = next;
      setTarget(next);
    };
    let pointer: Point | null = null;
    const scheduler = createFrameScheduler(() => {
      const element = pointer ? elementAtPoint(pointer, host) : null;
      update(element ? { element, source: "pointer" } : null);
    });

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      pointer = isFromHost(event, host) ? null : { x: event.clientX, y: event.clientY };
      scheduler.schedule();
    };

    const block = (event: Event) => {
      if (isFromHost(event, host)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const onClick = (event: MouseEvent) => {
      if (isFromHost(event, host)) return;
      block(event);
      const point = { x: event.clientX, y: event.clientY };
      const element =
        elementAtPoint(point, host) ?? (event.target instanceof Element ? event.target : null);
      if (element) pick.current(element, point);
    };

    const onFocusIn = (event: FocusEvent) => {
      if (isFromHost(event, host) || !(event.target instanceof Element)) return;
      update({ element: event.target, source: "keyboard" });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const current = targetRef.current?.element ?? null;
      if (isWalkKey(event.key)) {
        event.preventDefault();
        const next = current ? walkElement(current, event.key, host) : initialKeyboardTarget(host);
        next.scrollIntoView({ block: "nearest", inline: "nearest" });
        update({ element: next, source: "keyboard" });
      } else if (event.key === "Enter" && current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        pick.current(current, centerOf(current));
      }
    };

    const removeCursor = injectCursorStyle();
    const capture = { capture: true } as const;
    window.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
    window.addEventListener("click", onClick, capture);
    window.addEventListener("focusin", onFocusIn, capture);
    window.addEventListener("keydown", onKeyDown, capture);
    for (const type of BLOCKED_POINTER_EVENTS) window.addEventListener(type, block, capture);

    return () => {
      scheduler.cancel();
      removeCursor();
      update(null);
      window.removeEventListener("pointermove", onPointerMove, capture);
      window.removeEventListener("click", onClick, capture);
      window.removeEventListener("focusin", onFocusIn, capture);
      window.removeEventListener("keydown", onKeyDown, capture);
      for (const type of BLOCKED_POINTER_EVENTS) window.removeEventListener(type, block, capture);
    };
  }, [active, host, pick]);

  return active ? target : null;
}
