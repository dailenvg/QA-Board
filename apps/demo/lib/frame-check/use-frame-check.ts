import { useEffect, useState } from "react";
import type { FrameCheckResult } from "./types";

export type FrameCheckState = { status: "checking" } | { status: "done"; result: FrameCheckResult };

const CHECK_FAILED: FrameCheckResult = { verdict: "unknown", reason: "check-failed" };

function isResult(value: unknown): value is FrameCheckResult {
  return typeof value === "object" && value !== null && "verdict" in value;
}

/** Asks the server whether `url` may be framed. `attempt` re-runs the check. */
export function useFrameCheck(url: string, attempt: number): FrameCheckState {
  const [state, setState] = useState<{ key: string; result: FrameCheckResult } | null>(null);
  const key = `${attempt}:${url}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/frame-check?url=${encodeURIComponent(url)}`, { signal: controller.signal })
      .then((response) => response.json() as Promise<unknown>)
      .then((body) => setState({ key, result: isResult(body) ? body : CHECK_FAILED }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ key, result: CHECK_FAILED });
      });
    return () => controller.abort();
  }, [key, url]);

  return state?.key === key ? { status: "done", result: state.result } : { status: "checking" };
}
