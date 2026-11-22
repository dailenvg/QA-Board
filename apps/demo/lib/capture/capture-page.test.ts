import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as BrowserModule from "./browser";
import { browserTurn, CLOSE_LIMIT_MS, type CaptureBrowser } from "./browser";
import { capturePage } from "./capture-page";
import { LOGIN_SIGNALS_SCRIPT, type LoginSignals } from "./login-page";

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

const SIGN_IN: LoginSignals = {
  title: "Sign in",
  heading: "Welcome back",
  passwordInputs: 1,
  newPasswordInputs: 0,
  fields: 1,
  forms: 1,
  textLength: 200,
  links: 3,
};

/** A browser whose one page loads at once, ends on `finalUrl` and reads as `signals`. */
function loadedBrowser(finalUrl: string, signals: LoginSignals) {
  const screenshot = vi.fn(() => Promise.resolve({ data: Buffer.from("jpeg").toString("base64") }));
  const page = {
    setDefaultTimeout: () => {},
    on: () => {},
    goto: () => Promise.resolve({ headers: () => ({}) }),
    waitForLoadState: () => Promise.resolve(),
    url: () => finalUrl,
    evaluate: (script: string) =>
      Promise.resolve(
        script === LOGIN_SIGNALS_SCRIPT
          ? signals
          : script.includes("scrollHeight")
            ? 1200
            : undefined,
      ),
    addStyleTag: () => Promise.resolve(),
    context: () => ({ newCDPSession: () => Promise.resolve({ send: screenshot }) }),
  };
  const launched = {
    browser: {
      newContext: () => Promise.resolve({ newPage: () => Promise.resolve(page) }),
      once: () => {},
    },
    close: () => Promise.resolve(),
  } as unknown as CaptureBrowser;
  return { launched, screenshot };
}

describe("capturePage on a login screen", () => {
  afterEach(() => {
    mocks.launch.mockReset();
  });

  it("fails with login-page and never takes the picture", async () => {
    const { launched, screenshot } = loadedBrowser(
      "https://vercel.com/login?next=%2Fsso-api",
      SIGN_IN,
    );
    mocks.launch.mockResolvedValue(launched);
    const result = capturePage(URL_, 1440, new AbortController().signal, log);
    await expect(result).rejects.toMatchObject({ code: "login-page" });
    expect(screenshot).not.toHaveBeenCalled();
  });

  it("takes the picture of a page that only has a login box", async () => {
    const { launched, screenshot } = loadedBrowser("https://example.com/", {
      ...SIGN_IN,
      title: "Example",
      textLength: 8_000,
      links: 60,
    });
    mocks.launch.mockResolvedValue(launched);
    const image = await capturePage(URL_, 1440, new AbortController().signal, log);
    expect(image).toMatchObject({ width: 1440, height: 1200, contentType: "image/jpeg" });
    expect(screenshot).toHaveBeenCalledTimes(1);
  });
});
