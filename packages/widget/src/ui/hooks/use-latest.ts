import { useLayoutEffect, useRef, type RefObject } from "react";

/** Ref that always holds the latest value, for reading inside long-lived callbacks. */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
