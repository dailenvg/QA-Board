import { useCallback, useState } from "react";

export interface DialogState<T> {
  open: boolean;
  /** Last payload; kept after closing so content stays put during the exit animation. */
  payload: T | null;
  show: (payload: T) => void;
  close: () => void;
}

export function useDialogState<T>(): DialogState<T> {
  const [state, setState] = useState<{ open: boolean; payload: T | null }>({
    open: false,
    payload: null,
  });
  const show = useCallback((payload: T) => setState({ open: true, payload }), []);
  const close = useCallback(() => setState((current) => ({ ...current, open: false })), []);
  return { ...state, show, close };
}
