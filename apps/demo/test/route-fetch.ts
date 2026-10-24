import * as clientViewRoute from "@/app/api/s/[token]/route";
import * as clientBlobRoute from "@/app/api/s/[token]/blobs/[key]/route";
import * as clientCommentsRoute from "@/app/api/s/[token]/comments/route";
import * as shareRoute from "@/app/api/shares/[shareId]/route";
import * as ownerBlobRoute from "@/app/api/shares/[shareId]/blobs/[key]/route";
import * as changesRoute from "@/app/api/shares/[shareId]/changes/route";
import * as createRoute from "@/app/api/shares/route";

type Call = (request: Request, params: Record<string, string>) => Promise<Response>;
type Handler<P extends string> = (
  request: Request,
  context: { params: Promise<Record<P, string>> },
) => Promise<Response>;

interface Route {
  pattern: RegExp;
  calls: Partial<Record<string, Call>>;
}

/** A route: a path pattern whose groups are `names`, and its method handlers. */
function route<P extends string>(
  pattern: RegExp,
  names: readonly P[],
  handlers: Partial<Record<string, Handler<P>>>,
): Route {
  const calls: Partial<Record<string, Call>> = {};
  for (const [method, handler] of Object.entries(handlers)) {
    if (!handler) continue;
    calls[method] = (request, params) => {
      const picked = Object.fromEntries(names.map((name) => [name, params[name] ?? ""]));
      return handler(request, { params: Promise.resolve(picked as Record<P, string>) });
    };
  }
  return { pattern, calls };
}

const ROUTES: Route[] = [
  route(/^\/api\/shares$/, [], { POST: (request) => createRoute.POST(request) }),
  route(/^\/api\/shares\/(?<shareId>[^/]+)$/, ["shareId"], {
    PUT: shareRoute.PUT,
    DELETE: shareRoute.DELETE,
  }),
  route(/^\/api\/shares\/(?<shareId>[^/]+)\/changes$/, ["shareId"], { GET: changesRoute.GET }),
  route(/^\/api\/shares\/(?<shareId>[^/]+)\/blobs\/(?<key>[^/]+)$/, ["shareId", "key"], {
    GET: ownerBlobRoute.GET,
    PUT: ownerBlobRoute.PUT,
  }),
  route(/^\/api\/s\/(?<token>[^/]+)$/, ["token"], { GET: clientViewRoute.GET }),
  route(/^\/api\/s\/(?<token>[^/]+)\/comments$/, ["token"], { POST: clientCommentsRoute.POST }),
  route(/^\/api\/s\/(?<token>[^/]+)\/blobs\/(?<key>[^/]+)$/, ["token", "key"], {
    GET: clientBlobRoute.GET,
  }),
];

let address = 0;

/**
 * A `fetch` that sends the browser code's requests to the real route handlers,
 * each from its own address so per-IP limits don't interfere. `intercept` can
 * answer a request first (to simulate failures).
 */
export function routeFetch(intercept?: (request: Request) => Response | null) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : input.toString();
    const request = new Request(new URL(url, "http://localhost"), init);
    address += 1;
    request.headers.set("x-forwarded-for", `198.51.100.${address % 250}`);
    const early = intercept?.(request);
    if (early) return early;
    const path = new URL(request.url).pathname;
    for (const { pattern, calls } of ROUTES) {
      const match = pattern.exec(path);
      const call = match ? calls[request.method] : undefined;
      if (match && call) return call(request, match.groups ?? {});
    }
    throw new Error(`No route for ${request.method} ${path}`);
  };
}
