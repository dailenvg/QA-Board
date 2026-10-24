import { useCallback, useState } from "react";

/**
 * Content-box width of an element, in whole px, kept current by a
 * ResizeObserver. Zero until the first measurement. Attach the returned ref.
 */
export function useElementWidth<T extends HTMLElement>(): [(node: T | null) => () => void, number] {
  const [width, setWidth] = useState(0);
  const ref = useCallback((node: T | null) => {
    if (!node) return () => {};
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
