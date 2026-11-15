import { json } from "../../share/http";
import type { Seats } from "./seats";

/**
 * How the members routes answer the refusals they share. Each writes nothing
 * and says what the browser needs to explain it.
 */

const NO_STORE = { "cache-control": "no-store" };

/** The actor's people switch went off before the lock (re-checked under L1): as `refusalFor` says it. */
export function notAllowed(): Response {
  return json({ error: "not-allowed", permission: "members.manage" }, 403);
}

/** Not enough seats left for what was asked: how many are used, of how many. */
export function seatsFull(seats: Seats): Response {
  return json({ error: "seats-full", used: seats.used, limit: seats.limit }, 409);
}

/** Over the day's invite email limit: when all of it would fit, and how many went out. */
export function emailLimited({
  retryAfterSeconds,
  sentInWindow,
  limit,
}: {
  retryAfterSeconds: number;
  sentInWindow: number;
  limit: number;
}): Response {
  return Response.json(
    { error: "rate-limited", retryAfterSeconds, sentInWindow, limit },
    { status: 429, headers: { ...NO_STORE, "retry-after": String(retryAfterSeconds) } },
  );
}

/** Sent again too soon after its last email: when it can be. */
export function tooSoon(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "cooldown", retryAfterSeconds },
    { status: 429, headers: { ...NO_STORE, "retry-after": String(retryAfterSeconds) } },
  );
}
