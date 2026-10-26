import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as BrowserModule from "./browser";
import { browserTurn, CLOSE_LIMIT_MS, type CaptureBrowser } from "./browser";
import { capturePage } from "./capture-page";

const mocks = vi.hoisted(() => ({ launch: vi.fn<() => Promise<CaptureBrowser>>() }));

vi.mock("./browser", async (importOriginal) => ({
  ...(await importOriginal<typeof BrowserModule>()),
  launchBrowser: () => mocks.launch(),
}));
vi.mock("./guard-proxy", () => ({
  REFUSED_HEADER: "x-squint-refused",
  startGuardProxy: () =>
    Promise.resolve({ server: "http://127.0.0.1:9", refused: () => false, close: () => {} }),
}));

const URL_ = new URL("https://example.com");
const log = () => {};

/** Whether `promise` settles within a few ticks. */
async function settles(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  void promise.then(() => (settled = true));
  await vi.advanceTimersByTimeAsync(0);
  return settled;
}

/** A browser stuck in every call, whose close never finishes either. */
function hungBrowser(): CaptureBrowser {
  const never = () => new Promise<never>(() => {});
  return {
    browser: { newContext: never, once: () => {} },
    close: never,
  } as unknown as CaptureBrowser;
}

describe("capturePage turns", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("VERCEL", "1");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    mocks.launch.mockReset();
  });

  it("gives up its turn at once when its signal aborted while it waited", async () => {
    const endFirst = await browserTurn();
    const controller = new AbortController();
    const result = capturePage(URL_, 1440, controller.signal, log).catch((error: unknown) => error);
    controller.abort();
    endFirst();
    expect(await result).toMatchObject({ code: "timeout" });
    expect(mocks.launch).not.toHaveBeenCalled();
    const next = browserTurn();
    expect(await settles(next)).toBe(true);
    (await next)();
  });

  it("frees the turn after an abort even when the browser and its close hang", async () => {
    mocks.launch.mockResolvedValue(hungBrowser());
    const controller = new AbortController();
    void capturePage(URL_, 1440, controller.signal, log).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.launch).toHaveBeenCalled();
    const next = browserTurn();
    controller.abort();
    await vi.advanceTimersByTimeAsync(CLOSE_LIMIT_MS - 1);
    expect(await settles(next)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await settles(next)).toBe(true);
    (await next)();
  });
});
