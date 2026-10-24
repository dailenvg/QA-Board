import type { CaptureErrorCode } from "./types";

export type CaptureFailure = CaptureErrorCode | "offline" | "storage";

/** What the viewer says when a snapshot can't be taken or kept. */
export const CAPTURE_MESSAGES: Record<CaptureFailure, string> = {
  "invalid-request": "This address can't be captured. Check it and try again.",
  "private-host":
    "Squint can only take snapshots of public sites, not local or private addresses. Upload a screenshot instead.",
  unreachable: "We couldn't reach the site to take a snapshot. It may be offline or blocking us.",
  timeout: "The page took too long to load for a snapshot. Try again, or upload a screenshot.",
  "rate-limited": "That's a lot of snapshots in a short time. Wait a minute, then try again.",
  busy: "Squint is busy taking other snapshots. Try again in a moment.",
  unavailable: "Snapshots aren't available on this server right now. Upload a screenshot instead.",
  failed: "The snapshot didn't work. Try again, or upload a screenshot.",
  offline: "Squint couldn't reach its server. Check your connection and try again.",
  storage: "This browser couldn't save the snapshot. Free up some space and try again.",
};
