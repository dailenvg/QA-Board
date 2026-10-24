import http from "node:http";
import net, { type AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { REFUSED_HEADER, startGuardProxy, type GuardProxy } from "./guard-proxy";

let proxy: GuardProxy | null = null;
let target: http.Server | null = null;

afterEach(() => {
  proxy?.close();
  target?.close();
  proxy = null;
  target = null;
});

/** A private service the page must never reach. */
async function privateService(): Promise<number> {
  target = http.createServer((_request, response) => response.end("secret"));
  await new Promise<void>((done) => target?.listen(0, "127.0.0.1", done));
  return (target.address() as AddressInfo).port;
}

function proxyPort(guard: GuardProxy): number {
  return Number(new URL(guard.server).port);
}

function viaProxy(
  guard: GuardProxy,
  url: string,
): Promise<{ status: number; refused?: string; body: string }> {
  return new Promise((done, fail) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port: proxyPort(guard),
        path: url,
        headers: { host: new URL(url).host },
      },
      (response) => {
        let body = "";
        response.on("data", (chunk: Buffer) => (body += chunk.toString()));
        response.on("end", () =>
          done({
            status: response.statusCode ?? 0,
            refused: response.headers[REFUSED_HEADER] as string | undefined,
            body,
          }),
        );
      },
    );
    request.on("error", fail);
    request.end();
  });
}

function connect(guard: GuardProxy, authority: string): Promise<string> {
  return new Promise((done, fail) => {
    const socket = net.connect(proxyPort(guard), "127.0.0.1", () => {
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
    });
    socket.once("data", (chunk: Buffer) => {
      done(chunk.toString().split("\r\n")[0] ?? "");
      socket.destroy();
    });
    socket.on("error", fail);
  });
}

describe("startGuardProxy", () => {
  it("refuses plain requests to private addresses and marks the refusal", async () => {
    const port = await privateService();
    proxy = await startGuardProxy();
    const response = await viaProxy(proxy, `http://127.0.0.1:${port}/`);
    expect(response).toEqual({ status: 403, refused: "1", body: "" });
    expect(proxy.refused()).toBe(true);
  });

  it("refuses tunnels to loopback by address or by name", async () => {
    const port = await privateService();
    proxy = await startGuardProxy();
    expect(await connect(proxy, `127.0.0.1:${port}`)).toBe("HTTP/1.1 403 Forbidden");
    expect(await connect(proxy, `localhost:${port}`)).toBe("HTTP/1.1 403 Forbidden");
    expect(await connect(proxy, `[::1]:${port}`)).toBe("HTTP/1.1 403 Forbidden");
  });

  it("starts with nothing refused", async () => {
    proxy = await startGuardProxy();
    expect(proxy.refused()).toBe(false);
    expect(proxy.server).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
});
