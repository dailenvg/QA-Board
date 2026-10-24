/** Response of `GET /api/frame-check?url=`. */
export type FrameCheckResult =
  | { verdict: "embeddable"; finalUrl: string; status: number }
  | { verdict: "blocked"; reason: "x-frame-options" | "csp"; finalUrl: string }
  | {
      verdict: "unreachable";
      reason: "timeout" | "network" | "too-many-redirects";
    }
  /** The server could not or would not check (private address, bad input); let the browser try. */
  | { verdict: "unknown"; reason: "private-host" | "invalid-url" | "check-failed" };
