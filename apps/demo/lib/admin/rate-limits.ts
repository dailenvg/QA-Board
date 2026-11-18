import { IMAGE_UPLOAD_RATE_LIMIT } from "../account/image-upload";
import { EMAIL_CHANGE_TTL_MS, MAX_EMAIL_CHANGES_PER_HOUR } from "../account/email-change";
import { MAX_RESETS_PER_HOUR, RESET_TTL_MS } from "../auth/password-reset";
import { LOGIN_WINDOW_MS, MAX_FAILURES_PER_EMAIL, MAX_FAILURES_PER_IP } from "../auth/rate-limit";
import { RESET_REQUEST_RATE_LIMIT } from "../auth/reset-request-handler";
import { CAPTURE_RATE_LIMIT } from "../capture/http";
import type { RateLimitConfig } from "../capture/rate-limit";
import { CLICKUP_CONNECT_RATE_LIMIT } from "../integrations/clickup/connect";
import { CLICKUP_READ_RATE_LIMIT, CLICKUP_SEND_RATE_LIMIT } from "../integrations/clickup/send";
import { pinpointRateLimit } from "../pinpoint-rate-limit";
import { SHARE_RATE_LIMITS } from "../share/http";
import {
  INVITE_WINDOW_MS,
  MAX_INVITES_PER_MEMBER,
  MAX_INVITES_PER_WORKSPACE,
} from "../share/invite-limits";
import {
  MAX_FAILURES_PER_ADDRESS,
  MAX_FAILURES_PER_LINK,
  PASSWORD_WINDOW_MS,
} from "../share/password-attempts";
import { INVITE_EMAIL_WINDOW_MS, MAX_INVITE_EMAILS } from "../workspace/members/invite-sends";

/**
 * Every rate limit in Squint, for the System page, from the constants the
 * limits themselves use, so the page can't say other numbers. Postgres
 * limits hold across every server; the in-memory ones are per server
 * instance, a brake rather than an exact quota.
 */

export type RateLimitBackend = "postgres" | "memory";

/** What a limit counts by. */
export type RateLimitScope = "address" | "email" | "account" | "link" | "workspace" | "member";

export type RateLimitId =
  | "signInEmail"
  | "signInAddress"
  | "resetEmails"
  | "emailChanges"
  | "linkPasswordLink"
  | "linkPasswordAddress"
  | "linkInvitesWorkspace"
  | "linkInvitesMember"
  | "memberInvites"
  | "resetRequests"
  | "join"
  | "imageUploads"
  | "capture"
  | "shareCreate"
  | "shareOwnerWrite"
  | "shareOwnerRead"
  | "clientRead"
  | "clientComment"
  | "clientEdit"
  | "clientCapture"
  | "clientUnlock"
  | "card"
  | "clickUpConnect"
  | "clickUpSend"
  | "clickUpRead"
  | "pinpoint";

export interface RateLimitEntry extends RateLimitConfig {
  /** Its name in the panel's copy. */
  id: RateLimitId;
  per: RateLimitScope;
  backend: RateLimitBackend;
}

type Env = Readonly<Record<string, string | undefined>>;

const postgres = (
  id: RateLimitId,
  per: RateLimitScope,
  limit: number,
  windowMs: number,
): RateLimitEntry => ({ id, per, backend: "postgres", limit, windowMs });

const memory = (id: RateLimitId, per: RateLimitScope, config: RateLimitConfig): RateLimitEntry => ({
  id,
  per,
  backend: "memory",
  limit: config.limit,
  windowMs: config.windowMs,
});

/** Every limit, Postgres first; the pinpoint widget's as `PINPOINT_RATE_LIMIT` sets it in `env`. */
export function rateLimits(env: Env = process.env): RateLimitEntry[] {
  const share = SHARE_RATE_LIMITS;
  return [
    postgres("signInEmail", "email", MAX_FAILURES_PER_EMAIL, LOGIN_WINDOW_MS),
    postgres("signInAddress", "address", MAX_FAILURES_PER_IP, LOGIN_WINDOW_MS),
    postgres("resetEmails", "account", MAX_RESETS_PER_HOUR, RESET_TTL_MS),
    postgres("emailChanges", "account", MAX_EMAIL_CHANGES_PER_HOUR, EMAIL_CHANGE_TTL_MS),
    postgres("linkPasswordLink", "link", MAX_FAILURES_PER_LINK, PASSWORD_WINDOW_MS),
    postgres("linkPasswordAddress", "address", MAX_FAILURES_PER_ADDRESS, PASSWORD_WINDOW_MS),
    postgres("linkInvitesWorkspace", "workspace", MAX_INVITES_PER_WORKSPACE, INVITE_WINDOW_MS),
    postgres("linkInvitesMember", "member", MAX_INVITES_PER_MEMBER, INVITE_WINDOW_MS),
    postgres("memberInvites", "workspace", MAX_INVITE_EMAILS, INVITE_EMAIL_WINDOW_MS),
    memory("resetRequests", "address", RESET_REQUEST_RATE_LIMIT),
    memory("join", "address", share.join),
    memory("imageUploads", "account", IMAGE_UPLOAD_RATE_LIMIT),
    memory("capture", "address", CAPTURE_RATE_LIMIT),
    memory("shareCreate", "address", share.create),
    memory("shareOwnerWrite", "address", share.ownerWrite),
    memory("shareOwnerRead", "address", share.ownerRead),
    memory("clientRead", "address", share.clientRead),
    memory("clientComment", "address", share.clientComment),
    memory("clientEdit", "address", share.clientEdit),
    memory("clientCapture", "address", share.clientCapture),
    memory("clientUnlock", "address", share.clientUnlock),
    memory("card", "address", share.card),
    memory("clickUpConnect", "account", CLICKUP_CONNECT_RATE_LIMIT),
    memory("clickUpSend", "account", CLICKUP_SEND_RATE_LIMIT),
    memory("clickUpRead", "account", CLICKUP_READ_RATE_LIMIT),
    memory("pinpoint", "address", pinpointRateLimit(env)),
  ];
}
