import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "../store/types";
import { CAPTURE_MESSAGES, captureFailed, type CaptureFailure } from "./messages";
import { clampWidth } from "./types";

/**
 * `failure`: the capture's own reason, when it has one (see `CaptureOutcome`).
 * `partial`: the capture that just finished only got the top of a long page;
 * it lasts until the next capture starts, and is never stored.
 */
export type CaptureState =
  | { status: "idle"; partial?: true }
  | { status: "capturing" }
  | { status: "failed"; message: string; failure?: CaptureFailure };

const IDLE: CaptureState = { status: "idle" };

/**
 * Past the capture routes' 60 s limit (a 45 s capture plus a cold start), so a
 * server that can answer always does first.
 */
export const CLIENT_CAPTURE_TIMEOUT_MS = 75_000;

type Outcome =
  | { ok: true; snapshot: Snapshot; partial?: true }
  | { ok: false; message: string; failure?: CaptureFailure };

/**
 * The state a capture leaves once it settles: failed when it ran out of time
 * or failed, idle when it was cancelled, and idle (noting a partial page) when
 * it worked.
 */
export function settledState(
  outcome: Outcome | null,
  { timedOut, aborted }: { timedOut: boolean; aborted: boolean },
): CaptureState {
  if (timedOut) return { status: "failed", message: CAPTURE_MESSAGES.timeout, failure: "timeout" };
  if (!outcome || aborted) return IDLE;
  if (!outcome.ok) return { status: "failed", message: outcome.message, failure: outcome.failure };
  return outcome.partial ? { status: "idle", partial: true } : IDLE;
}

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
        const aborted = current.signal.aborted;
        setState(settledState(outcome, { timedOut, aborted }));
        if (outcome?.ok && !timedOut && !aborted) onCapturedRef.current(outcome.snapshot);
      };
      void capturer(clampWidth(width), current.signal).then(settle, () =>
        settle(captureFailed("failed")),
      );
    },
    [capturer],
  );

  return { state, capture };
}
