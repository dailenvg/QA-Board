import { samePage } from "../page-address";

/** What a cooperating site posts to the page framing it, on load and on every navigation. */
export const LOCATION_MESSAGE = "squint:location";

/** The parts of a `MessageEvent` that decide whether to trust it. */
export interface FrameMessage {
  data: unknown;
  origin: string;
  source: unknown;
}

/**
 * The page a framed site says it's on, or null. Trusted only when it comes
 * from the review's own iframe (`frame`), that frame is on the project's
 * origin, and the address it names is on that origin too. Nothing else in the
 * message is read.
 */
export function readLocationMessage(
  message: FrameMessage,
  frame: unknown,
  projectUrl: string,
): string | null {
  if (!frame || message.source !== frame) return null;
  const { data } = message;
  if (typeof data !== "object" || data === null) return null;
  const { type, href } = data as Record<string, unknown>;
  if (type !== LOCATION_MESSAGE || typeof href !== "string") return null;
  if (!samePage(message.origin, projectUrl)) return null;
  return samePage(href, projectUrl);
}
