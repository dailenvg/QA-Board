import {
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { viewportSize, type RectLike } from "../core/geometry";
import { isSheetViewport, placePopover, scrollToClear, sheetMetrics } from "../core/placement";
import { useLatest } from "./hooks/use-latest";
import { useReducedMotion } from "./hooks/use-reduced-motion";

const FOCUSABLE = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled)",
  "textarea:not(:disabled)",
  "select:not(:disabled)",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Events swallowed on the page while `guardOutside` is on, so links and buttons stay inert. */
const GUARDED_EVENTS = ["mousedown", "pointerup", "mouseup", "click", "auxclick", "dblclick"];

interface PopoverProps {
  /** Rect the popover points at, in viewport coordinates. */
  anchor: RectLike;
  closing: boolean;
  labelledBy: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Called on a pointer press outside the popover (unless guarded). */
  onDismiss: () => void;
  /**
   * When true, presses on the host page are swallowed in the capture phase
   * (no navigation, no page handlers) and `onOutsideBlocked` runs instead of
   * `onDismiss`. Presses on other widget controls still dismiss.
   */
  guardOutside?: boolean;
  onOutsideBlocked?: () => void;
  children: ReactNode;
}

function activeElementIn(node: Node): Element | null {
  const root = node.getRootNode();
  return root instanceof ShadowRoot || root instanceof Document ? root.activeElement : null;
}

function hostOf(node: Node): Element | null {
  const root = node.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** Floating placement on wide screens; a bottom sheet clear of the keyboard below 480px. */
function position(node: HTMLDivElement, anchor: RectLike): void {
  const viewport = viewportSize();
  if (isSheetViewport(viewport.width)) {
    const { bottom, maxHeight } = sheetMetrics(viewport.height, window.visualViewport ?? null);
    node.dataset.sheet = "";
    node.dataset.side = "bottom";
    node.style.transform = "";
    node.style.setProperty("--pp-sheet-bottom", `${bottom}px`);
    node.style.setProperty("--pp-sheet-max", `${maxHeight}px`);
    return;
  }
  delete node.dataset.sheet;
  const placement = placePopover({
    anchor,
    size: { width: node.offsetWidth, height: node.offsetHeight },
    viewport,
  });
  node.style.transform = `translate(${placement.x}px, ${placement.y}px)`;
  node.dataset.side = placement.side;
}

/** Focus-trapping dialog that flips and clamps itself inside the viewport. */
export function Popover({
  anchor,
  closing,
  labelledBy,
  initialFocusRef,
  onDismiss,
  guardOutside = false,
  onOutsideBlocked,
  children,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const callbacks = useLatest({ onDismiss, onOutsideBlocked, guardOutside });
  const clearedForHeight = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    position(node, anchor);

    // As a sheet, keep the pin visible above it: once on open and again when
    // the visible height changes (the keyboard opening), never on every scroll.
    const visibleHeight = window.visualViewport?.height ?? window.innerHeight;
    if (node.dataset.sheet === undefined || clearedForHeight.current === visibleHeight) return;
    clearedForHeight.current = visibleHeight;
    const overlap = scrollToClear(anchor, node.getBoundingClientRect().top);
    if (overlap > 0) window.scrollBy({ top: overlap, behavior: reduceMotion ? "auto" : "smooth" });
  });

  useEffect(() => {
    const target = initialFocusRef?.current ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus({ preventScroll: true });
  }, [initialFocusRef]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const host = hostOf(node);
    const isOutside = (event: Event) => !event.composedPath().includes(node);
    const isOnPage = (event: Event) => !host || !event.composedPath().includes(host);
    const isGuarded = (event: Event) =>
      callbacks.current.guardOutside && isOutside(event) && isOnPage(event);
    const swallow = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!isOutside(event)) return;
      if (isGuarded(event)) {
        swallow(event);
        callbacks.current.onOutsideBlocked?.();
        return;
      }
      callbacks.current.onDismiss();
    };
    const onGuardedEvent = (event: Event) => {
      if (isGuarded(event)) swallow(event);
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    for (const type of GUARDED_EVENTS) window.addEventListener(type, onGuardedEvent, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      for (const type of GUARDED_EVENTS) window.removeEventListener(type, onGuardedEvent, true);
    };
  }, [callbacks]);

  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const node = ref.current;
    if (event.key !== "Tab" || !node) return;
    const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    const active = activeElementIn(node);
    const outside = !active || !node.contains(active);
    if (event.shiftKey && (outside || active === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (outside || active === last)) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={ref}
      className="pp-popover"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      data-state={closing ? "closed" : "open"}
      onKeyDown={trapFocus}
    >
      <div className="pp-popover__panel">{children}</div>
    </div>
  );
}
