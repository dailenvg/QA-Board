import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "../store/types";
import { clampWidth } from "./types";

export type CaptureState =
  { status: "idle" } | { status: "capturing" } | { status: "failed"; message: string };

const IDLE: CaptureState = { status: "idle" };

type Outcome = { ok: true; snapshot: Snapshot } | { ok: false; message: string };
export type Capturer = (width: number, signal: AbortSignal) => Promise<Outcome | null>;

/**
 * Takes snapshots through `capturer` (the owner's store, or a share's
 * server). A new capture cancels the one in flight; leaving the viewer
 * cancels it too. Null when the project can't be captured (images).
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
      setState({ status: "capturing" });
      void capturer(clampWidth(width), current.signal).then((outcome) => {
        if (!outcome || current.signal.aborted) return;
        if (!outcome.ok) {
          setState({ status: "failed", message: outcome.message });
          return;
        }
        setState(IDLE);
        onCapturedRef.current(outcome.snapshot);
      });
    },
    [capturer],
  );

  return { state, capture };
}
