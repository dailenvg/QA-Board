/**
 * Wire contract, mirrored from `@pinpoint/widget` (src/core/types.ts).
 *
 * Kept self-contained so it can be compared line by line with the widget's
 * copy. `test/contract.ts` fails typecheck if the two drift apart.
 * Every date is an ISO 8601 string.
 */

export const PRIORITIES = ["nit", "should", "must"] as const;

export type Priority = (typeof PRIORITIES)[number];

/** Upper bound for a decoded screenshot payload, enforced by the server. */
export const MAX_SCREENSHOT_BYTES = 1.5 * 1024 * 1024;

/** Maximum length of a comment or reply body. */
export const MAX_BODY_LENGTH = 5000;

/** Maximum length of an author name. */
export const MAX_NAME_LENGTH = 80;

/** Header that carries the review token on every request. */
export const TOKEN_HEADER = "x-pinpoint-token";

export interface PinAnchor {
  /** CSS selector that uniquely matched the target element at creation time. */
  selector: string;
  /** Horizontal offset inside the element's bounding box, 0-100. */
  xPct: number;
  /** Vertical offset inside the element's bounding box, 0-100. */
  yPct: number;
  /** Horizontal position as a percentage of the viewport, used when detached. */
  viewportXPct: number;
  /** Vertical position as a percentage of the viewport, used when detached. */
  viewportYPct: number;
}

export interface PinContext {
  viewport: { width: number; height: number };
  userAgent: string;
}

export interface Reply {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface Pin {
  id: string;
  /** Page path the pin belongs to, without query string or hash. */
  path: string;
  /** Git branch the pin was left on; set by the server. */
  branch: string | null;
  /** Origin of the deployment the pin was created on. */
  deploymentUrl: string;
  /** Page URL with `?pin=<id>` appended, never containing the review token. */
  deepLink: string;
  anchor: PinAnchor;
  author: string;
  body: string;
  priority: Priority | null;
  screenshotUrl: string | null;
  context: PinContext;
  replies: Reply[];
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
}

export interface ListPinsQuery {
  path: string;
}

export interface CreatePinInput {
  path: string;
  /** Full page URL with review and pin params removed. */
  pageUrl: string;
  anchor: PinAnchor;
  author: string;
  body: string;
  priority: Priority | null;
  /** PNG data URL (`data:image/png;base64,...`) or null when capture failed. */
  screenshot: string | null;
  context: PinContext;
}

export interface AddReplyInput {
  pinId: string;
  author: string;
  body: string;
}

export interface ResolvePinInput {
  pinId: string;
  author: string;
}

/** PATCH body: a discriminated union on `action`. */
export type UpdatePinRequest =
  ({ action: "reply" } & AddReplyInput) | ({ action: "resolve" } & ResolvePinInput);

/** GET `?path=` response. */
export interface ListPinsResponse {
  pins: Pin[];
}

/** POST and PATCH response. */
export interface PinResponse {
  pin: Pin;
}

/** Body of every non-2xx response. */
export interface ErrorResponse {
  error: string;
}
