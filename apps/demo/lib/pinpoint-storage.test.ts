import { afterEach, describe, expect, it, vi } from "vitest";
import { silentPostgres } from "@/test/silent-postgres";
import { CONNECT_TIMEOUT_MS } from "./db/database";
import { storageFromEnv } from "./pinpoint-storage";

const PARAMS = { branch: "main", path: "/" };

/** Pinpoint's Postgres storage against a local server that never answers a connect. */
describe("storageFromEnv's Postgres migrations", () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    vi.useRealTimers();
    for (const close of closers.splice(0)) await close();
  });

  it("start with the first call and, after a timeout, run again on the next", async () => {
    const server = await silentPostgres("connect");
    closers.push(() => server.close());
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { kind, storage } = storageFromEnv({ NODE_ENV: "test", DATABASE_URL: server.url });
    expect(kind).toBe("postgres");
    expect(server.connections).toBe(0);
    for (const expected of [1, 2]) {
      const failed = expect(storage.listPins(PARAMS)).rejects.toThrow(/timeout/);
      await server.stalled();
      await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);
      await failed;
      expect(server.connections).toBe(expected);
    }
  });
});
