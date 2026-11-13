import * as author from "@/app/api/w/[workspaceId]/author/route";
import * as blobCommit from "@/app/api/w/[workspaceId]/blobs/commit/route";
import * as blobToken from "@/app/api/w/[workspaceId]/blobs/token/route";
import * as folder from "@/app/api/w/[workspaceId]/folders/[folderId]/route";
import * as folders from "@/app/api/w/[workspaceId]/folders/route";
import * as importRoute from "@/app/api/w/[workspaceId]/import/route";
import * as archive from "@/app/api/w/[workspaceId]/projects/[projectId]/archive/route";
import * as blob from "@/app/api/w/[workspaceId]/projects/[projectId]/blobs/[key]/route";
import * as comment from "@/app/api/w/[workspaceId]/projects/[projectId]/comments/[commentId]/route";
import * as comments from "@/app/api/w/[workspaceId]/projects/[projectId]/comments/route";
import * as label from "@/app/api/w/[workspaceId]/projects/[projectId]/label/route";
import * as pages from "@/app/api/w/[workspaceId]/projects/[projectId]/pages/route";
import * as restore from "@/app/api/w/[workspaceId]/projects/[projectId]/restore/route";
import * as project from "@/app/api/w/[workspaceId]/projects/[projectId]/route";
import * as shareInvites from "@/app/api/w/[workspaceId]/projects/[projectId]/share-link/invites/route";
import * as shareLink from "@/app/api/w/[workspaceId]/projects/[projectId]/share-link/route";
import * as sharePassword from "@/app/api/w/[workspaceId]/projects/[projectId]/share-link/password/route";
import * as shareSettings from "@/app/api/w/[workspaceId]/projects/[projectId]/share-link/settings/route";
import * as snapshot from "@/app/api/w/[workspaceId]/projects/[projectId]/snapshots/[snapshotId]/route";
import * as snapshots from "@/app/api/w/[workspaceId]/projects/[projectId]/snapshots/route";
import * as projects from "@/app/api/w/[workspaceId]/projects/route";
import * as workspaceSnapshot from "@/app/api/w/[workspaceId]/snapshot/route";

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

/** Every workspace route: its path below `/api/w/<workspaceId>`, with `:name` segments, and its methods. */
const ROUTES: Array<[string, Partial<Record<string, unknown>>]> = [
  ["/snapshot", workspaceSnapshot],
  ["/author", author],
  ["/import", importRoute],
  ["/folders", folders],
  ["/folders/:folderId", folder],
  ["/projects", projects],
  ["/projects/:projectId", project],
  ["/projects/:projectId/restore", restore],
  ["/projects/:projectId/archive", archive],
  ["/projects/:projectId/label", label],
  ["/projects/:projectId/pages", pages],
  ["/projects/:projectId/snapshots", snapshots],
  ["/projects/:projectId/snapshots/:snapshotId", snapshot],
  ["/projects/:projectId/comments", comments],
  ["/projects/:projectId/comments/:commentId", comment],
  ["/projects/:projectId/share-link", shareLink],
  ["/projects/:projectId/share-link/settings", shareSettings],
  ["/projects/:projectId/share-link/password", sharePassword],
  ["/projects/:projectId/share-link/invites", shareInvites],
  ["/projects/:projectId/blobs/:key", blob],
  ["/blobs/token", blobToken],
  ["/blobs/commit", blobCommit],
];

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** Every (method, route) pair, for suites that must cover them all. */
export const ENDPOINTS: Array<{ method: string; route: string }> = ROUTES.flatMap(
  ([route, module]) =>
    METHODS.filter((method) => typeof module[method] === "function").map((method) => ({
      method,
      route,
    })),
);

export const ORIGIN = "http://localhost:3000";

export interface CallInit {
  cookie?: string;
  /** JSON-encoded unless it's bytes or a string. */
  body?: unknown;
  headers?: Record<string, string>;
}

/** The handler for `method` at `path` (`/api/w/<id>/…`), with its params; null when there's none. */
function resolve(method: string, path: string) {
  const segments = path
    .replace(/^\/api\/w\//, "")
    .replace(/\?.*$/, "")
    .split("/");
  const [workspaceId, ...rest] = segments;
  for (const [route, module] of ROUTES) {
    const pattern = route.split("/").slice(1);
    if (pattern.length !== rest.length) continue;
    const params: Record<string, string> = { workspaceId: workspaceId ?? "" };
    const matches = pattern.every((part, index) => {
      const value = rest[index] ?? "";
      if (part.startsWith(":")) params[part.slice(1)] = value;
      return part.startsWith(":") || part === value;
    });
    const handler = module[method] as Handler | undefined;
    if (matches && handler) return { handler, params };
  }
  return null;
}

/** Calls the handler for `method path` (`/api/w/<id>/…`) as Next.js would, from a same-site browser. */
export async function call(method: string, path: string, init: CallInit = {}): Promise<Response> {
  const found = resolve(method, path);
  if (!found) throw new Error(`No route for ${method} ${path}`);
  const { body } = init;
  const encoded =
    body === undefined || body instanceof Uint8Array || typeof body === "string"
      ? (body as BodyInit | undefined)
      : JSON.stringify(body);
  const request = new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      host: "localhost:3000",
      ...(method === "GET" ? {} : { origin: ORIGIN, "content-type": "application/json" }),
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...init.headers,
    },
    body: method === "GET" ? undefined : encoded,
  });
  return found.handler(request, { params: Promise.resolve(found.params) });
}

/**
 * A `fetch` for browser code under test: `/api/w/…` requests go to the
 * workspace route handlers as a same-site browser signed in with `cookie`
 * would send them; anything else goes to `others`, with the cookie too.
 */
export function workspaceFetch(cookie: string, others: typeof fetch): typeof fetch {
  return async (input, init) => {
    const source = new Request(
      new URL(input instanceof Request ? input.url : input.toString(), ORIGIN),
      init,
    );
    const { pathname, search } = new URL(source.url);
    const found = pathname.startsWith("/api/w/") ? resolve(source.method, pathname) : null;
    if (!found) {
      // Same origin: the browser sends the session cookie to every route.
      const headers = new Headers(init?.headers);
      headers.set("cookie", cookie);
      return others(input, { ...init, headers });
    }
    const headers = new Headers(source.headers);
    headers.set("host", "localhost:3000");
    headers.set("cookie", cookie);
    if (source.method !== "GET") headers.set("origin", ORIGIN);
    const body = source.method === "GET" ? undefined : await source.arrayBuffer();
    const request = new Request(`${ORIGIN}${pathname}${search}`, {
      method: source.method,
      headers,
      body,
    });
    return found.handler(request, { params: Promise.resolve(found.params) });
  };
}

/** `route` with its `:name` segments filled in. */
export function fill(route: string, values: Record<string, string>): string {
  return route.replace(/:(\w+)/g, (_match, name: string) => values[name] ?? name);
}
