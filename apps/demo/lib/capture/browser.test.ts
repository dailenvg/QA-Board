import type { BrowserServer } from "playwright-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserTurn, CLOSE_LIMIT_MS, closeOrKill } from "./browser";

/** Whether `promise` settles within a few ticks. */
async function settles(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  void promise.then(() => (settled = true));
  for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
  return settled;
}

describe("browserTurn", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("makes serverless captures take turns", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "");
    const endFirst = await browserTurn();
    const second = browserTurn();
    expect(await settles(second)).toBe(false);
    endFirst();
    expect(await settles(second)).toBe(true);
    (await second)();
  });

  it("lets local captures run side by side", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "");
    await browserTurn();
    expect(await settles(browserTurn())).toBe(true);
  });
});

describe("closeOrKill", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function fakeServer(close: () => Promise<void>) {
    const kill = vi.fn();
    const server = { close, process: () => ({ kill }) } as unknown as BrowserServer;
    return { server, kill };
  }

  it("closes gracefully when Chromium answers", async () => {
    const { server, kill } = fakeServer(() => Promise.resolve());
    const log = vi.fn();
    await closeOrKill(server, log);
    expect(kill).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("closed");
  });

  it("kills Chromium when a graceful close stalls, and settles within the limit", async () => {
    vi.useFakeTimers();
    const { server, kill } = fakeServer(() => new Promise(() => {}));
    const log = vi.fn();
    const closing = closeOrKill(server, log);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(kill).toHaveBeenCalledWith("SIGKILL");
    expect(log).toHaveBeenCalledWith("killed");
    await vi.advanceTimersByTimeAsync(CLOSE_LIMIT_MS - 2_000);
    await expect(closing).resolves.toBeUndefined();
  });
});
