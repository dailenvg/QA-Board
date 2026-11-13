import * as account from "@/app/api/account/route";
import * as avatar from "@/app/api/account/avatar/route";
import * as email from "@/app/api/account/email/route";
import * as password from "@/app/api/account/password/route";
import * as profile from "@/app/api/account/profile/route";
import * as sessions from "@/app/api/account/sessions/route";
import * as storage from "@/app/api/account/storage/route";
import * as logo from "@/app/api/account/workspace/logo/route";
import * as workspace from "@/app/api/account/workspace/route";
import * as clickUp from "@/app/api/account/workspace/integrations/clickup/route";

type Handler = (request: Request) => Promise<Response>;

/** Every account route: its path and its methods. */
const ROUTES: Array<[string, Partial<Record<string, unknown>>]> = [
  ["/api/account", account],
  ["/api/account/profile", profile],
  ["/api/account/password", password],
  ["/api/account/email", email],
  ["/api/account/sessions", sessions],
  ["/api/account/avatar", avatar],
  ["/api/account/workspace", workspace],
  ["/api/account/workspace/logo", logo],
  ["/api/account/workspace/integrations/clickup", clickUp],
  ["/api/account/storage", storage],
];

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** Every (method, path) pair, for suites that must cover them all. */
export const ACCOUNT_ENDPOINTS: Array<{ method: string; path: string }> = ROUTES.flatMap(
  ([path, module]) =>
    METHODS.filter((method) => typeof module[method] === "function").map((method) => ({
      method,
      path,
    })),
);

/** The endpoints that change something: refused from another site, or with a form's body. */
export const ACCOUNT_WRITE_ENDPOINTS = ACCOUNT_ENDPOINTS.filter(({ method }) => method !== "GET");

export const ORIGIN = "http://localhost:3000";

export interface AccountCallInit {
  cookie?: string;
  /** JSON-encoded unless it's a string or bytes (sent as they are). None on a GET. */
  body?: unknown;
  headers?: Record<string, string>;
  /** `?query` for the URL. */
  search?: string;
}

function encodeBody(body: unknown): BodyInit {
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return new Uint8Array(body);
  return JSON.stringify(body);
}

/**
 * Calls the handler for `method path` as Next.js would, from a same-site
 * browser sending JSON (set `content-type` in `headers` for anything else).
 */
export function callAccount(
  method: string,
  path: string,
  init: AccountCallInit = {},
): Promise<Response> {
  const handlers = ROUTES.find(([route]) => route === path)?.[1];
  const handler = handlers?.[method] as Handler | undefined;
  if (!handler) throw new Error(`No route for ${method} ${path}`);
  const { body = {} } = init;
  return handler(
    new Request(`${ORIGIN}${path}${init.search ?? ""}`, {
      method,
      headers: {
        host: "localhost:3000",
        origin: ORIGIN,
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.7",
        ...(init.cookie ? { cookie: init.cookie } : {}),
        ...init.headers,
      },
      ...(method === "GET" ? {} : { body: encodeBody(body) }),
    }),
  );
}
