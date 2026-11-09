import { once } from "node:events";
import { createServer, type AddressInfo, type Socket } from "node:net";

/** AuthenticationOk, then ReadyForQuery (idle): a handshake with no password. */
const HANDSHAKE = Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0, 0x5a, 0, 0, 0, 5, 0x49]);

/** A simple-protocol Query message's type byte. */
const QUERY = 0x51;

/**
 * A local stand-in for a Postgres that stops answering, as Neon's does for a
 * connection it dropped while the function was frozen: it accepts TCP, then
 * goes silent from the start (`"connect"`) or once the handshake is done and
 * the first query arrives (`"query"`). `stalled()` resolves when a client has
 * reached the silence; `connections` counts the clients that tried.
 */
export async function silentPostgres(silentAt: "connect" | "query") {
  const sockets = new Set<Socket>();
  let reached: () => void = () => undefined;
  let stall = new Promise<void>((resolve) => (reached = resolve));
  let connections = 0;
  const server = createServer((socket) => {
    connections += 1;
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let greeted = false;
    socket.on("data", (chunk) => {
      if (silentAt === "query" && !greeted) socket.write(HANDSHAKE);
      else if (silentAt === "connect" || chunk[0] === QUERY) reached();
      greeted = true;
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return {
    url: `postgres://squint:squint@127.0.0.1:${port}/squint`,
    get connections() {
      return connections;
    },
    /** Resolves once a client is waiting on the silence; then arms the next wait. */
    async stalled() {
      await stall;
      stall = new Promise<void>((resolve) => (reached = resolve));
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      server.close();
      await once(server, "close");
    },
  };
}
