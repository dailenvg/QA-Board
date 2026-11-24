import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * Whether the content (`contentRef`) is taller than the box holding it
 * (`boxRef`), kept up to date as either resizes. A box that only scrolls while
 * this is true clips nothing
 * the rest of the time, so a menu opened in it can spill past its edge.
 * The content's own height leaves out absolutely placed children (an open
 * menu), so opening one never turns the scrolling on.
 */
export function useOverflowing(): {
  boxRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  overflowing: boolean;
  /** The content's own height, in px: 0 until measured. */
  contentHeight: number;
} {
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);

  useLayoutEffect(() => {
    const outer = boxRef.current;
    const inner = contentRef.current;
    if (!outer || !inner) return;
    const measure = () => {
      setOverflowing(inner.offsetHeight > outer.clientHeight + 1);
      setContentHeight(inner.offsetHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return { boxRef, contentRef, overflowing, contentHeight };
}
