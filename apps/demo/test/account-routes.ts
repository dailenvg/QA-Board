import * as email from "@/app/api/account/email/route";
import * as password from "@/app/api/account/password/route";
import * as profile from "@/app/api/account/profile/route";
import * as sessions from "@/app/api/account/sessions/route";

type Handler = (request: Request) => Promise<Response>;

/** Every account route: its path and its methods. */
const ROUTES: Array<[string, Partial<Record<string, unknown>>]> = [
  ["/api/account/profile", profile],
  ["/api/account/password", password],
  ["/api/account/email", email],
  ["/api/account/sessions", sessions],
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

export const ORIGIN = "http://localhost:3000";

export interface AccountCallInit {
  cookie?: string;
  /** JSON-encoded unless it's a string. */
  body?: unknown;
  headers?: Record<string, string>;
}

/** Calls the handler for `method path` as Next.js would, from a same-site browser sending JSON. */
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
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: {
        host: "localhost:3000",
        origin: ORIGIN,
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.7",
        ...(init.cookie ? { cookie: init.cookie } : {}),
        ...init.headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}
