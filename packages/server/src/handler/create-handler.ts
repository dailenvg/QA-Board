import type { z } from "zod";
import { buildDeepLink } from "../lib/deeplink";
import { createPinInputSchema, pathSchema, updatePinRequestSchema } from "../schemas";
import { isStorageError, type PinDraft, type Screenshot, type StorageAdapter } from "../storage";
import type { ListPinsResponse, PinResponse } from "../types";
import { readToken, tokensMatch } from "./auth";
import { clientIp } from "./client-ip";
import { branchFromEnv, deploymentUrlFromEnv, linkBaseUrlFromEnv } from "./env";
import { createRateLimiter, type RateLimitOptions } from "./rate-limit";
import { errorResponse, json } from "./responses";
import { parseScreenshot } from "./screenshot";

export interface PinpointHandlerOptions {
  storage: StorageAdapter;
  /** Shared review token. Defaults to `process.env.PINPOINT_REVIEW_TOKEN`. */
  reviewToken?: string;
  /** POST limit per IP. Defaults to 10 per minute; `false` disables it. */
  rateLimit?: RateLimitOptions | false;
  /**
   * Failed-auth limit per IP across GET, POST and PATCH. Defaults to 20
   * failures per 10 minutes, then 429 until the window slides; `false` disables it.
   */
  authFailureLimit?: RateLimitOptions | false;
  /** Branch pins are keyed by. Defaults to `VERCEL_GIT_COMMIT_REF`, else "local". */
  branch?: string;
  /** Recorded on each pin. Defaults to `VERCEL_URL`, else `VERCEL_BRANCH_URL`, else the request origin. */
  deploymentUrl?: string;
  /** Origin for deep links. Defaults to `VERCEL_BRANCH_URL`, else `VERCEL_URL`, else the request origin. */
  linkBaseUrl?: string;
  /** Clock and id generator, injectable for tests. */
  now?: () => number;
  generateId?: () => string;
}

export type RouteHandler = (request: Request) => Promise<Response>;

export interface PinpointHandler {
  GET: RouteHandler;
  POST: RouteHandler;
  PATCH: RouteHandler;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; response: Response };

const MAX_REQUEST_CHARS = 3 * 1024 * 1024;
const NOT_CONFIGURED = "Pinpoint is not configured: set PINPOINT_REVIEW_TOKEN on the server.";
const UNAUTHORIZED = "Missing or invalid review token";

function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request";
  const where = issue.path.length > 0 ? issue.path.join(".") : "body";
  return `Invalid request: ${where}: ${issue.message}`;
}

function validate<T>(schema: z.ZodType<T>, value: unknown): Parsed<T> {
  const result = schema.safeParse(value);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, response: errorResponse(400, describeIssue(result.error)) };
}

async function readJson(request: Request): Promise<Parsed<unknown>> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_REQUEST_CHARS) {
    return { ok: false, response: errorResponse(413, "Request body too large") };
  }
  const text = await request.text();
  if (text.length > MAX_REQUEST_CHARS) {
    return { ok: false, response: errorResponse(413, "Request body too large") };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, response: errorResponse(400, "Request body must be valid JSON") };
  }
}

function withErrorHandling(handler: RouteHandler): RouteHandler {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (isStorageError(error)) return errorResponse(error.status, error.message);
      console.error("[pinpoint] Request failed", error);
      return errorResponse(500, "Internal error");
    }
  };
}

/**
 * Builds Web-standard `GET`, `POST`, and `PATCH` handlers for `/api/pinpoint`.
 * In the Next.js App Router: `export const { GET, POST, PATCH } = createPinpointHandler(...)`.
 */
export function createPinpointHandler(options: PinpointHandlerOptions): PinpointHandler {
  const { storage } = options;
  const reviewToken = options.reviewToken ?? process.env.PINPOINT_REVIEW_TOKEN;
  const branch = options.branch ?? branchFromEnv();
  const now = options.now ?? Date.now;
  const generateId = options.generateId ?? (() => crypto.randomUUID());
  const limiter =
    options.rateLimit === false ? null : createRateLimiter({ now, ...options.rateLimit });
  const authFailures =
    options.authFailureLimit === false
      ? null
      : createRateLimiter({ limit: 20, windowMs: 10 * 60_000, now, ...options.authFailureLimit });

  if (!reviewToken) console.error(`[pinpoint] ${NOT_CONFIGURED}`);

  function tooMany(message: string, retryAfterSeconds: number): Response {
    return errorResponse(429, message, { "retry-after": String(retryAfterSeconds) });
  }

  async function authorize(request: Request): Promise<Response | null> {
    if (!reviewToken) return errorResponse(500, NOT_CONFIGURED);
    const ip = clientIp(request.headers);
    const blocked = authFailures?.check(ip);
    if (blocked && !blocked.allowed) {
      return tooMany("Too many failed attempts, try again later", blocked.retryAfterSeconds);
    }
    const provided = readToken(request.headers);
    if (!provided || !(await tokensMatch(provided, reviewToken))) {
      authFailures?.hit(ip);
      return errorResponse(401, UNAUTHORIZED);
    }
    return null;
  }

  function rateLimited(request: Request): Response | null {
    const result = limiter?.hit(clientIp(request.headers));
    if (!result || result.allowed) return null;
    return tooMany("Too many comments, try again shortly", result.retryAfterSeconds);
  }

  const GET: RouteHandler = async (request) => {
    const denied = await authorize(request);
    if (denied) return denied;
    const path = validate(pathSchema, new URL(request.url).searchParams.get("path"));
    if (!path.ok) return path.response;

    const body: ListPinsResponse = { pins: await storage.listPins({ branch, path: path.value }) };
    return json(200, body);
  };

  const POST: RouteHandler = async (request) => {
    if (!reviewToken) return errorResponse(500, NOT_CONFIGURED);
    const limited = rateLimited(request);
    if (limited) return limited;
    const denied = await authorize(request);
    if (denied) return denied;

    const raw = await readJson(request);
    if (!raw.ok) return raw.response;
    const input = validate(createPinInputSchema, raw.value);
    if (!input.ok) return input.response;

    let screenshot: Screenshot | null = null;
    if (input.value.screenshot !== null) {
      const parsed = parseScreenshot(input.value.screenshot);
      if (!parsed.ok) return errorResponse(parsed.status, parsed.error);
      screenshot = parsed.screenshot;
    }

    const origin = new URL(request.url).origin;
    const id = generateId();
    const { pageUrl, screenshot: _dataUrl, ...fields } = input.value;
    const draft: PinDraft = {
      ...fields,
      id,
      branch,
      deploymentUrl: options.deploymentUrl ?? deploymentUrlFromEnv() ?? origin,
      deepLink: buildDeepLink(
        options.linkBaseUrl ?? linkBaseUrlFromEnv() ?? origin,
        fields.path,
        pageUrl,
        id,
      ),
      screenshot,
      replies: [],
      resolved: false,
      resolvedAt: null,
      resolvedBy: null,
      createdAt: new Date(now()).toISOString(),
    };

    const body: PinResponse = { pin: await storage.createPin(draft) };
    return json(201, body);
  };

  const PATCH: RouteHandler = async (request) => {
    const denied = await authorize(request);
    if (denied) return denied;
    const raw = await readJson(request);
    if (!raw.ok) return raw.response;
    const update = validate(updatePinRequestSchema, raw.value);
    if (!update.ok) return update.response;

    const timestamp = new Date(now()).toISOString();
    const { value } = update;
    const pin =
      value.action === "reply"
        ? await storage.addReply({
            branch,
            pinId: value.pinId,
            reply: {
              id: generateId(),
              author: value.author,
              body: value.body,
              createdAt: timestamp,
            },
          })
        : await storage.resolvePin({
            branch,
            pinId: value.pinId,
            resolvedBy: value.author,
            resolvedAt: timestamp,
          });

    const body: PinResponse = { pin };
    return json(200, body);
  };

  return {
    GET: withErrorHandling(GET),
    POST: withErrorHandling(POST),
    PATCH: withErrorHandling(PATCH),
  };
}
