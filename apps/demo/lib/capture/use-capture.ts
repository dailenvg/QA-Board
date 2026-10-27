import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "../store/types";
import { CAPTURE_MESSAGES } from "./messages";
import { clampWidth } from "./types";

export type CaptureState =
  { status: "idle" } | { status: "capturing" } | { status: "failed"; message: string };

const IDLE: CaptureState = { status: "idle" };

/** Past the capture route's 60 s limit, so a server that can answer always does first. */
export const CLIENT_CAPTURE_TIMEOUT_MS = 75_000;

type Outcome = { ok: true; snapshot: Snapshot } | { ok: false; message: string };
export type Capturer = (width: number, signal: AbortSignal) => Promise<Outcome | null>;

/**
 * Takes snapshots through `capturer` (the owner's store, or a share's
 * server). A new capture cancels the one in flight; leaving the viewer
 * cancels it too. Null when the project can't be captured (images).
 * A capture always ends: cancelled with nothing newer, it goes back to idle
 * (so the stage can start another); unanswered or thrown, it fails with Retry.
 */
export function useCapture(
  capturer: Capturer | null,
  onCaptured: (snapshot: Snapshot) => void,
): { state: CaptureState; capture: (width: number) => void } {
  const [state, setState] = useState<CaptureState>(IDLE);
  const controller = useRef<AbortController | null>(null);
  const onCapturedRef = useRef(onCaptured);
  useEffect(() => {
    onCapturedRef.current = onCaptured;
  });
  useEffect(() => () => controller.current?.abort(), []);

  const capture = useCallback(
    (width: number) => {
      if (!capturer) return;
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        current.abort();
      }, CLIENT_CAPTURE_TIMEOUT_MS);
      setState({ status: "capturing" });

      const settle = (outcome: Outcome | null) => {
        clearTimeout(timer);
        // A newer capture took over: the state is its to set.
        if (controller.current !== current) return;
        controller.current = null;
        if (timedOut) {
          setState({ status: "failed", message: CAPTURE_MESSAGES.timeout });
          return;
        }
        if (!outcome || current.signal.aborted) {
          setState(IDLE);
          return;
        }
        if (!outcome.ok) {
          setState({ status: "failed", message: outcome.message });
          return;
        }
        setState(IDLE);
        onCapturedRef.current(outcome.snapshot);
      };
      void capturer(clampWidth(width), current.signal).then(settle, () =>
        settle({ ok: false, message: CAPTURE_MESSAGES.failed }),
      );
    },
    [capturer],
  );

  return { state, capture };
}
