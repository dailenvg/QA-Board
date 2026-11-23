import { z } from "zod";

/** The longest user agent kept; a longer header is cut to this. */
export const USER_AGENT_MAX = 512;

/** Pixel ratios are kept to two decimals, so 1.2500000001 and 1.25 read the same. */
export const roundRatio = (value: number) => Math.round(value * 100) / 100;

const viewportSide = z.number().int().min(1).max(10_000);

/**
 * What the browser says about itself when it posts: the window's size in CSS
 * px, its pixel ratio, and its platform when it shares one (Chromium's client
 * hints: `platform` and `platformVersion`). Any of it may be missing.
 */
export const sentClientInfoSchema = z.object({
  viewport: z.object({ width: viewportSide, height: viewportSide }).optional(),
  dpr: z.number().min(0.5).max(8).transform(roundRatio).optional(),
  platform: z
    .object({ name: z.string().max(40), version: z.string().max(40).optional() })
    .optional(),
});

/**
 * The browser a comment was posted from, as it's stored (`client_info`, 052):
 * what the browser sent, with the user agent the server saw on the request.
 * Team only: never pushed to a review link, never in a guest's view.
 */
export const clientInfoSchema = sentClientInfoSchema.extend({
  userAgent: z.string().max(USER_AGENT_MAX),
});

export type SentClientInfo = z.infer<typeof sentClientInfoSchema>;
export type ClientInfo = z.infer<typeof clientInfoSchema>;

/** The `User-Agent` header as it's kept: cut to `USER_AGENT_MAX`, empty when there's none. */
export function userAgentOf(request: Request): string {
  return (request.headers.get("user-agent") ?? "").slice(0, USER_AGENT_MAX);
}

/** A stored value as `ClientInfo`, or null when it isn't one (none recorded, or a shape it can't read). */
export function parseClientInfo(value: unknown): ClientInfo | null {
  const parsed = clientInfoSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** What a post sends: the server takes the user agent from the request itself. */
export function sentPart(info: ClientInfo): SentClientInfo {
  const { userAgent: _userAgent, ...sent } = info;
  return sent;
}
