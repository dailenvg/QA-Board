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
/** A detail-0 click counts as keyboard activation only this soon after Enter/Space on it. */
export const KEYBOARD_CLICK_WINDOW_MS = 500;

interface KeyActivation {
  target: EventTarget | null;
  at: number;
}

/**
 * Clicks with `detail === 0` come from keyboard activation (Space or Enter on
 * a focused control) or from scripts calling `element.click()`. Only the
 * former is a reviewer choosing an element.
 */
export function isKeyboardClick(
  click: Pick<MouseEvent, "detail" | "target">,
  activation: KeyActivation | null,
  now: number,
): boolean {
  if (click.detail !== 0 || !activation) return false;
  return activation.target === click.target && now - activation.at <= KEYBOARD_CLICK_WINDOW_MS;
}
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
    let lastKeyActivation: KeyActivation | null = null;
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
      if (event.detail === 0) {
        // Keyboard activation reports 0,0 coordinates, so pin the focused control
        // at its centre. Script-dispatched clicks (`el.click()`) are swallowed
        // without a pin: comment mode still blocks their navigation.
        const keyboard = isKeyboardClick(event, lastKeyActivation, performance.now());
        lastKeyActivation = null;
        if (keyboard && event.target instanceof Element) {
          pick.current(event.target, centerOf(event.target));
        }
        return;
      }
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
      if (event.key === " " || event.key === "Enter") {
        lastKeyActivation = { target: event.target, at: performance.now() };
      }
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
