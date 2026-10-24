"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { spring } from "@/lib/motion";

export interface ToastInput {
  message: string;
  tone?: "neutral" | "error";
  action?: { label: string; onAction: () => void };
  /** Runs when the toast goes away without its action being used (timed out or replaced). */
  onDismiss?: () => void;
}

interface Toast extends ToastInput {
  id: number;
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => {});

const DISMISS_MS = { neutral: 4000, error: 7000 } as const;

/**
 * Shows short status messages as an inverted pill at the bottom of the screen.
 * The timer pauses while the toast is hovered or focused, so an Undo is never
 * snatched away mid-reach (WCAG 2.2.1).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [pausedId, setPausedId] = useState<number | null>(null);
  const nextId = useRef(0);
  /** The toast on screen, so the one it replaces can be told it was dismissed. */
  const current = useRef<Toast | null>(null);
  const reduce = useReducedMotion();
  const paused = toast !== null && pausedId === toast.id;

  const replace = useCallback((next: Toast | null, dismissed: boolean) => {
    const previous = current.current;
    current.current = next;
    setToast(next);
    if (dismissed) previous?.onDismiss?.();
  }, []);

  const show = useCallback(
    (input: ToastInput) => {
      nextId.current += 1;
      replace({ ...input, id: nextId.current }, true);
    },
    [replace],
  );

  useEffect(() => {
    if (!toast || paused) return;
    const timer = window.setTimeout(() => replace(null, true), DISMISS_MS[toast.tone ?? "neutral"]);
    return () => window.clearTimeout(timer);
  }, [toast, paused, replace]);

  const pause = () => {
    if (toast) setPausedId(toast.id);
  };
  const resume = () => setPausedId(null);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-[60] flex justify-center px-4"
      >
        <AnimatePresence mode="popLayout">
          {toast ? (
            <motion.div
              key={toast.id}
              data-testid="toast"
              onPointerEnter={pause}
              onPointerLeave={resume}
              onFocus={pause}
              onBlur={resume}
              initial={{ opacity: 0, y: reduce ? 0 : 12, scale: reduce ? 1 : 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: reduce ? 0 : 12, scale: reduce ? 1 : 0.96 }}
              transition={spring.snappy}
              className={`pointer-events-auto flex max-w-full min-h-11 items-center gap-3 rounded-pill py-1 pl-5 text-body font-semibold shadow-pop ${
                toast.tone === "error" ? "bg-danger text-card" : "bg-inv text-on-inv"
              } ${toast.action ? "pr-1" : "pr-5"}`}
            >
              <span>{toast.message}</span>
              {toast.action ? (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onAction();
                    replace(null, false);
                  }}
                  className="min-h-11 rounded-pill bg-on-inv/15 px-4 text-body font-semibold underline-offset-2 transition-colors hover:bg-on-inv/25 hover:underline focus-visible:outline-on-inv active:bg-on-inv/30"
                >
                  {toast.action.label}
                </button>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): (toast: ToastInput) => void {
  return useContext(ToastContext);
}
