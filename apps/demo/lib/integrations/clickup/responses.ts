import { rateLimited } from "../../account/with-account";
import { json } from "../../share/http";
import type { ClickUpSendOutcome } from "./send";

/** Each refusal's status: what the Send to ClickUp window tells apart. */
const STATUS = {
  "not-found": 404,
  "not-connected": 409,
  archived: 409,
  "channel-gone": 409,
  "channel-forbidden": 409,
  reconnect: 422,
  unreachable: 502,
} as const;

/** How a Send to ClickUp route answers a refusal: `{ error }`, and when to retry on a 429. */
export function clickUpRefusal(outcome: Exclude<ClickUpSendOutcome, { ok: true }>): Response {
  if (outcome.reason === "rate-limited") {
    return rateLimited(outcome.retryAfterSeconds ?? 60);
  }
  return json({ error: outcome.reason }, STATUS[outcome.reason]);
}

/** This site can't reach ClickUp (`clickUpApiUrl`). */
export function clickUpUnavailable(): Response {
  return json({ error: "unavailable" }, 503);
}
