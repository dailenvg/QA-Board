import { useCallback, useEffect, useRef, useState } from "react";

export interface CloseOptions {
  /** Move focus back to the element that opened the popover. Defaults to true. */
  restoreFocus?: boolean;
}

export interface Closable<T> {
  value: T | null;
  /** True while the exit animation runs; the content is still mounted. */
  closing: boolean;
  open: (value: T, trigger: HTMLElement | null) => void;
  close: (options?: CloseOptions) => void;
}

interface ClosableState<T> {
  value: T;
  closing: boolean;
}

/**
 * Open/close state for a popover with an exit animation and focus return.
 * Everything happens in event handlers, so there are no effect-driven renders.
 */
export function useClosable<T>(
  exitMs: number,
  fallbackFocus: () => HTMLElement | null,
): Closable<T> {
  const [state, setState] = useState<ClosableState<T> | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const open = useCallback(
    (value: T, trigger: HTMLElement | null) => {
      clearTimer();
      triggerRef.current = trigger;
      setState({ value, closing: false });
    },
    [clearTimer],
  );

  const close = useCallback(
    ({ restoreFocus = true }: CloseOptions = {}) => {
      clearTimer();
      setState((current) => current && { ...current, closing: true });
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setState((current) => (current?.closing ? null : current));
      }, exitMs);

      const trigger = triggerRef.current;
      triggerRef.current = null;
      if (restoreFocus) (trigger?.isConnected ? trigger : fallbackFocus())?.focus();
    },
    [clearTimer, exitMs, fallbackFocus],
  );

  return { value: state?.value ?? null, closing: state?.closing ?? false, open, close };
}
