import type { CaptureErrorCode } from "./types";

export type CaptureFailure = CaptureErrorCode | "offline" | "storage";

/**
 * What the viewer says when a snapshot can't be taken or kept. Owners and
 * clients both see these, and only owners can upload a screenshot, so the
 * messages don't suggest it: the upload button sits next to them when it's offered.
 */
export const CAPTURE_MESSAGES: Record<CaptureFailure, string> = {
  "invalid-request":
    "Squint can't take a snapshot of this address. Snapshots need a full http or https address.",
  "private-host": "Squint can only take snapshots of public sites, not local or private addresses.",
  unreachable:
    "We couldn't reach the site to take a snapshot. It may be offline or blocking Squint. Try again later.",
  timeout: "The page took too long to load for a snapshot. Try again.",
  "rate-limited": "That's a lot of snapshots in a short time. Wait a minute, then try again.",
  busy: "Squint is busy taking other snapshots. Try again in a moment.",
  unavailable: "Snapshots aren't available on this server right now. Try again later.",
  failed: "The snapshot didn't work. Try again.",
  offline: "Squint couldn't reach its server. Check your connection, then try again.",
  storage: "This browser couldn't save the snapshot. Free up some space, then try again.",
};
