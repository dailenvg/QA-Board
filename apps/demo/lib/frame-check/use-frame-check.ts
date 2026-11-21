import { useCallback, useEffect, useState } from "react";
import type { FrameCheckResult } from "./types";

export type FrameCheckState = { status: "checking" } | { status: "done"; result: FrameCheckResult };

/** One site's frame check: its answer, how many times it was asked again, and a way to ask. */
export interface FrameCheck {
  state: FrameCheckState;
  attempt: number;
  recheck: () => void;
}

const CHECKING: FrameCheckState = { status: "checking" };
const CHECK_FAILED: FrameCheckResult = { verdict: "unknown", reason: "check-failed" };

function isResult(value: unknown): value is FrameCheckResult {
  return typeof value === "object" && value !== null && "verdict" in value;
}

/**
 * Asks the server whether `url` may be framed; `recheck` asks again. Null
 * (not a website) asks nothing and stays `checking`.
 */
export function useFrameCheck(url: string | null): FrameCheck {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<{ key: string; result: FrameCheckResult } | null>(null);
  const key = `${attempt}:${url}`;

  useEffect(() => {
    if (url === null) return;
    const controller = new AbortController();
    fetch(`/api/frame-check?url=${encodeURIComponent(url)}`, { signal: controller.signal })
      .then((response) => response.json() as Promise<unknown>)
      .then((body) => setAnswer({ key, result: isResult(body) ? body : CHECK_FAILED }))
      .catch(() => {
        if (!controller.signal.aborted) setAnswer({ key, result: CHECK_FAILED });
      });
    return () => controller.abort();
  }, [key, url]);

  const recheck = useCallback(() => setAttempt((value) => value + 1), []);
  const state: FrameCheckState =
    answer?.key === key ? { status: "done", result: answer.result } : CHECKING;
  return { state, attempt, recheck };
}
