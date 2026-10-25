import http, { type IncomingMessage, type ServerResponse } from "node:http";
import net, { type AddressInfo, type Socket } from "node:net";
import { guardedLookup, isBlockedError, isBlockedHost } from "./guard";

/** Marks the proxy's own refusals, so a refused navigation can be told from a site's 403. */
export const REFUSED_HEADER = "x-squint-refused";

/** Everything one capture may download through the proxy. */
const MAX_BYTES = 100 * 1024 * 1024;

/** Hop-by-hop headers that are never forwarded. */
const HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export interface GuardProxy {
  /** `http://127.0.0.1:<port>`, for the browser context's proxy setting. */
  server: string;
  /** Whether any connection was refused for pointing at a non-public address. */
  refused: () => boolean;
  close: () => void;
}

interface Session {
  refuse: () => void;
  /** Counts downloaded bytes; false once the budget is spent. */
  spend: (bytes: number) => boolean;
}

/** `host:port` from a CONNECT request line, IPv6 literals in brackets. */
function authority(target: string | undefined): { host: string; port: number } | null {
  const match = /^(\[[^\]]+\]|[^:]+):(\d{1,5})$/.exec(target ?? "");
  if (!match?.[1] || !match[2]) return null;
  const port = Number(match[2]);
  return port > 0 && port < 65536 ? { host: match[1].replace(/^\[|\]$/g, ""), port } : null;
}

function tunnel(request: IncomingMessage, client: Socket, head: Buffer, session: Session): void {
  const target = authority(request.url);
  if (!target || isBlockedHost(target.host)) {
    if (target) session.refuse();
    client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    return;
  }
  const upstream = net.connect({ host: target.host, port: target.port, lookup: guardedLookup });
  upstream.once("connect", () => {
    client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length > 0) upstream.write(head);
    upstream.on("data", (chunk: Buffer) => {
      if (!session.spend(chunk.length)) upstream.destroy();
    });
    upstream.pipe(client);
    client.pipe(upstream);
  });
  upstream.on("error", (error) => {
    if (isBlockedError(error)) session.refuse();
    client.end(`HTTP/1.1 ${isBlockedError(error) ? "403 Forbidden" : "502 Bad Gateway"}\r\n\r\n`);
  });
  upstream.on("close", () => client.destroy());
  client.on("error", () => upstream.destroy());
  client.on("close", () => upstream.destroy());
}

function forwardedHeaders(headers: IncomingMessage["headers"]): http.OutgoingHttpHeaders {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !HOP_HEADERS.has(name)));
}

const REFUSED: [number, http.OutgoingHttpHeaders] = [403, { [REFUSED_HEADER]: "1" }];
const BAD_GATEWAY: [number, http.OutgoingHttpHeaders] = [502, {}];

/** Plain http:// requests arrive with an absolute URL. */
function forward(request: IncomingMessage, response: ServerResponse, session: Session): void {
  let url: URL;
  try {
    url = new URL(request.url ?? "");
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (url.protocol !== "http:" || isBlockedHost(url.hostname)) {
    session.refuse();
    response.writeHead(...REFUSED).end();
    return;
  }
  const upstream = http.request(
    url,
    { method: request.method, headers: forwardedHeaders(request.headers), lookup: guardedLookup },
    (reply) => {
      response.writeHead(reply.statusCode ?? 502, forwardedHeaders(reply.headers));
      reply.on("data", (chunk: Buffer) => {
        if (!session.spend(chunk.length)) reply.destroy();
      });
      reply.pipe(response);
    },
  );
  upstream.on("error", (error) => {
    if (isBlockedError(error)) session.refuse();
    if (!response.headersSent) {
      response.writeHead(...(isBlockedError(error) ? REFUSED : BAD_GATEWAY));
    }
    response.end();
  });
  request.pipe(upstream);
}

/**
 * A forward proxy for one capture's browser context. Every connection the page
 * makes (navigations, redirects, subresources, workers, WebSockets) is
 * resolved here and refused if it would reach a non-public address.
 */
export async function startGuardProxy(): Promise<GuardProxy> {
  let refused = false;
  let budget = MAX_BYTES;
  const session: Session = {
    refuse: () => {
      refused = true;
    },
    spend: (bytes) => {
      budget -= bytes;
      return budget >= 0;
    },
  };
  const sockets = new Set<Socket>();
  const server = http.createServer((request, response) => forward(request, response, session));
  server.on("connect", (request: IncomingMessage, client: Socket, head: Buffer) =>
    tunnel(request, client, head, session),
  );
  server.on("connection", (socket: Socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    server: `http://127.0.0.1:${port}`,
    refused: () => refused,
    close: () => {
      for (const socket of sockets) socket.destroy();
      server.close();
    },
  };
}
