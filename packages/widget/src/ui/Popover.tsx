import {
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { viewportSize, type RectLike } from "../core/geometry";
import { placePopover } from "../core/placement";
import { useLatest } from "./hooks/use-latest";

const FOCUSABLE = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled)",
  "textarea:not(:disabled)",
  "select:not(:disabled)",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

interface PopoverProps {
  /** Rect the popover points at, in viewport coordinates. */
  anchor: RectLike;
  closing: boolean;
  labelledBy: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Called on a pointer press outside the popover. */
  onDismiss: () => void;
  children: ReactNode;
}

function activeElementIn(node: Node): Element | null {
  const root = node.getRootNode();
  return root instanceof ShadowRoot || root instanceof Document ? root.activeElement : null;
}

/** Focus-trapping dialog that flips and clamps itself inside the viewport. */
export function Popover({
  anchor,
  closing,
  labelledBy,
  initialFocusRef,
  onDismiss,
  children,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const dismiss = useLatest(onDismiss);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const placement = placePopover({
      anchor,
      size: { width: node.offsetWidth, height: node.offsetHeight },
      viewport: viewportSize(),
    });
    node.style.transform = `translate(${placement.x}px, ${placement.y}px)`;
    node.dataset.side = placement.side;
  });

  useEffect(() => {
    const target = initialFocusRef?.current ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus({ preventScroll: true });
  }, [initialFocusRef]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !event.composedPath().includes(ref.current)) dismiss.current();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [dismiss]);

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
