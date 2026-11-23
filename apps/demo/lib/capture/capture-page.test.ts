import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as BrowserModule from "./browser";
import { browserTurn, CLOSE_LIMIT_MS, type CaptureBrowser } from "./browser";
import { capturePage, ENCODE_ALLOWANCE_MS } from "./capture-page";
import type * as StitchModule from "./stitch";
import { UNPIN_SCRIPT } from "./unpin";
import { LOGIN_SIGNALS_SCRIPT, type LoginSignals } from "./login-page";

const mocks = vi.hoisted(() => ({
  launch: vi.fn<() => Promise<CaptureBrowser>>(),
  /** Makes the stitch never settle, as a hung libvips would. */
  stitchHangs: false,
}));

vi.mock("./browser", async (importOriginal) => ({
  ...(await importOriginal<typeof BrowserModule>()),
  launchBrowser: () => mocks.launch(),
}));
vi.mock("./stitch", async (importOriginal) => {
  const actual = await importOriginal<typeof StitchModule>();
  return {
    ...actual,
    sizedSlices: (...args: Parameters<typeof actual.sizedSlices>) =>
      mocks.stitchHangs ? new Promise<never>(() => {}) : actual.sizedSlices(...args),
  };
});
vi.mock("./guard-proxy", () => ({
  REFUSED_HEADER: "x-squint-refused",
  startGuardProxy: () =>
    Promise.resolve({ server: "http://127.0.0.1:9", refused: () => false, close: () => {} }),
}));

const URL_ = new URL("https://example.com");
const log = () => {};
/** A capture whose slicing is never told to stop. */
const NO_STOP = new AbortController().signal;

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
    const result = capturePage(URL_, 1440, controller.signal, NO_STOP, log).catch(
      (error: unknown) => error,
    );
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
    void capturePage(URL_, 1440, controller.signal, NO_STOP, log).catch(() => undefined);
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
            ? 800
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
    const result = capturePage(URL_, 1440, new AbortController().signal, NO_STOP, log);
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
    const image = await capturePage(URL_, 1440, new AbortController().signal, NO_STOP, log);
    expect(image).toMatchObject({ width: 1440, height: 800, contentType: "image/jpeg" });
    expect(screenshot).toHaveBeenCalledTimes(1);
  });
});

interface Clip {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A JPEG of `clip`'s size in one shade per band, so the stitched image shows where each landed. */
function bandJpeg({ y, width, height }: Clip): Promise<Buffer> {
  const shade = Math.min(250, (y / 900) * 100);
  return sharp({ create: { width, height, channels: 3, background: { r: shade, g: 0, b: 0 } } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

/**
 * A browser whose one page is `pageHeight` px tall and shoots each clip as
 * `bandJpeg`. A list of heights is read in turn, the last one from then on: a
 * page that gets shorter as it scrolls. `events` records the lazy-content
 * scroll, the screenshots and the unpin script in order.
 */
function longPageBrowser(
  pageHeight: number | number[],
  shoot: (clip: Clip) => Promise<Buffer> = bandJpeg,
) {
  const heights = [pageHeight].flat();
  let measured = 0;
  const measure = () => heights[Math.min(measured++, heights.length - 1)];
  const events: string[] = [];
  const clips: Array<Clip & { captureBeyondViewport?: boolean }> = [];
  const send = async (_method: string, params: { clip: Clip; captureBeyondViewport?: boolean }) => {
    clips.push({ ...params.clip, captureBeyondViewport: params.captureBeyondViewport });
    events.push(`shot ${params.clip.y}`);
    return { data: (await shoot(params.clip)).toString("base64") };
  };
  const page = {
    setDefaultTimeout: () => {},
    on: () => {},
    goto: () => Promise.resolve({ headers: () => ({}) }),
    waitForLoadState: () => Promise.resolve(),
    url: () => "https://example.com/",
    evaluate: (script: string) => {
      if (script === UNPIN_SCRIPT) events.push("unpin");
      const settle = script.includes("document.fonts");
      if (settle) events.push("settle");
      return Promise.resolve(script.includes("scrollHeight") && !settle ? measure() : null);
    },
    addStyleTag: () => Promise.resolve(),
    context: () => ({ newCDPSession: () => Promise.resolve({ send }) }),
  };
  const launched = {
    browser: {
      newContext: () => Promise.resolve({ newPage: () => Promise.resolve(page) }),
      once: () => {},
    },
    close: () => Promise.resolve(),
  } as unknown as CaptureBrowser;
  return { launched, events, clips };
}

/** The red channel at the middle of row `y` of a JPEG. */
async function redAt(jpeg: Uint8Array, y: number): Promise<number> {
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + Math.floor(info.width / 2)) * info.channels] ?? -1;
}

describe("capturePage on a long page", () => {
  afterEach(() => {
    mocks.launch.mockReset();
  });

  it("shoots it a viewport at a time and stitches the slices in place", async () => {
    const { launched, events, clips } = longPageBrowser(2_000);
    mocks.launch.mockResolvedValue(launched);
    const image = await capturePage(URL_, 320, new AbortController().signal, NO_STOP, log);
    expect(image).toMatchObject({ width: 320, height: 2_000, scale: 1 });
    expect(image.partial).toBeUndefined();
    expect(clips).toEqual([
      { x: 0, y: 0, width: 320, height: 900, scale: 1, captureBeyondViewport: undefined },
      { x: 0, y: 900, width: 320, height: 900, scale: 1, captureBeyondViewport: undefined },
      { x: 0, y: 1_800, width: 320, height: 200, scale: 1, captureBeyondViewport: undefined },
    ]);
    // Pinned bars are unpinned before every slice after the first, the page scrolled to it.
    expect(events).toEqual(["settle", "shot 0", "unpin", "shot 900", "unpin", "shot 1800"]);
    const { width, height } = await sharp(image.body).metadata();
    expect([width, height]).toEqual([320, 2_000]);
    expect(await redAt(image.body, 450)).toBeLessThan(10);
    expect(await redAt(image.body, 1_350)).toBeGreaterThan(90);
    expect(await redAt(image.body, 1_900)).toBeGreaterThan(190);
  });

  it("returns the slices shot so far as partial once told to stop", async () => {
    const stop = new AbortController();
    const { launched, clips } = longPageBrowser(2_000, (clip) => {
      if (clip.y === 900) stop.abort();
      return bandJpeg(clip);
    });
    mocks.launch.mockResolvedValue(launched);
    const image = await capturePage(URL_, 320, new AbortController().signal, stop.signal, log);
    expect(image).toMatchObject({ width: 320, height: 900, partial: true });
    expect(clips).toHaveLength(2);
    expect((await sharp(image.body).metadata()).height).toBe(900);
  });

  it("still shoots the first slice when told to stop before the page settled", async () => {
    const stop = new AbortController();
    stop.abort();
    const { launched, events } = longPageBrowser(2_000);
    mocks.launch.mockResolvedValue(launched);
    const image = await capturePage(URL_, 320, new AbortController().signal, stop.signal, log);
    expect(image).toMatchObject({ height: 900, partial: true });
    // Nor does it scroll for lazy content first: there's only time for the top.
    expect(events).toEqual(["shot 0"]);
  });

  it("cuts the last slice to a page that got shorter as it scrolled", async () => {
    // A header pinned by a scroll handler leaves the flow once the page scrolls.
    const { launched, clips } = longPageBrowser([3_200, 3_140]);
    mocks.launch.mockResolvedValue(launched);
    const image = await capturePage(URL_, 320, new AbortController().signal, NO_STOP, log);
    expect(image).toMatchObject({ width: 320, height: 3_140 });
    expect(clips.map(({ y, height }) => [y, height])).toEqual([
      [0, 900],
      [900, 900],
      [1_800, 900],
      [2_700, 440],
    ]);
    expect((await sharp(image.body).metadata()).height).toBe(3_140);
  });

  it("stops at a slice cut short, even when the page grows back after it", async () => {
    const { launched, clips } = longPageBrowser([2_000, 1_750, 2_000]);
    mocks.launch.mockResolvedValue(launched);
    const image = await capturePage(URL_, 320, new AbortController().signal, NO_STOP, log);
    expect(image).toMatchObject({ width: 320, height: 1_750 });
    expect(image.partial).toBeUndefined();
    expect(clips.map(({ y, height }) => [y, height])).toEqual([
      [0, 900],
      [900, 850],
    ]);
    expect((await sharp(image.body).metadata()).height).toBe(1_750);
    // The short slice's band sits right under the first, with no padding between.
    expect(await redAt(image.body, 1_700)).toBeGreaterThan(90);
  });

  it("drops a last slice the shorter page no longer reaches", async () => {
    const { launched, clips } = longPageBrowser([2_710, 2_690]);
    mocks.launch.mockResolvedValue(launched);
    const image = await capturePage(URL_, 320, new AbortController().signal, NO_STOP, log);
    expect(image).toMatchObject({ height: 2_690 });
    expect(image.partial).toBeUndefined();
    expect(clips.map(({ y, height }) => [y, height])).toEqual([
      [0, 900],
      [900, 900],
      [1_800, 890],
    ]);
    expect((await sharp(image.body).metadata()).height).toBe(2_690);
  });

  it("keeps one screenshot for a page that fits the viewport", async () => {
    const { launched, clips } = longPageBrowser(900);
    mocks.launch.mockResolvedValue(launched);
    const image = await capturePage(URL_, 320, new AbortController().signal, NO_STOP, log);
    expect(image).toMatchObject({ width: 320, height: 900, scale: 1 });
    expect(clips).toEqual([
      { x: 0, y: 0, width: 320, height: 900, scale: 1, captureBeyondViewport: true },
    ]);
  });
});

describe("capturePage out of time with a long page shot", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    mocks.launch.mockReset();
  });

  it("times out without stitching when its signal aborted as the browser finished", async () => {
    const controller = new AbortController();
    const { launched } = longPageBrowser(2_000, (clip) => {
      if (clip.y === 1_800) controller.abort();
      return bandJpeg(clip);
    });
    mocks.launch.mockResolvedValue(launched);
    const steps: string[] = [];
    const result = capturePage(URL_, 320, controller.signal, NO_STOP, (step) => steps.push(step));
    await expect(result).rejects.toMatchObject({ code: "timeout" });
    expect(steps.some((step) => step.startsWith("stitching"))).toBe(false);
    const next = browserTurn();
    (await next)();
  });

  it("stops waiting when its signal aborts mid-stitch, and keeps the turn until sharp is done", async () => {
    const controller = new AbortController();
    const { launched } = longPageBrowser(2_000);
    mocks.launch.mockResolvedValue(launched);
    const steps: string[] = [];
    const result = capturePage(URL_, 320, controller.signal, NO_STOP, (step) => {
      steps.push(step);
      if (step.startsWith("stitching")) controller.abort();
    });
    await expect(result).rejects.toMatchObject({ code: "timeout" });
    const next = browserTurn();
    let started = false;
    void next.then(() => (started = true));
    await Promise.resolve();
    expect(started).toBe(false);
    (await next)();
    // The abort skipped the encode itself.
    expect(steps.some((step) => step.startsWith("stitched"))).toBe(false);
  });

  it("frees the turn a while after its signal aborts even when the stitch hangs", async () => {
    vi.useFakeTimers();
    try {
      mocks.stitchHangs = true;
      const { launched } = longPageBrowser(2_000, () => Promise.resolve(Buffer.from("jpeg")));
      mocks.launch.mockResolvedValue(launched);
      const controller = new AbortController();
      const steps: string[] = [];
      let stitchStarted = () => {};
      const stitching = new Promise<void>((resolve) => (stitchStarted = resolve));
      const result = capturePage(URL_, 320, controller.signal, NO_STOP, (step) => {
        steps.push(step);
        if (step.startsWith("stitching")) stitchStarted();
      });
      await stitching;
      const next = browserTurn();
      controller.abort();
      await expect(result).rejects.toMatchObject({ code: "timeout" });
      await vi.advanceTimersByTimeAsync(CLOSE_LIMIT_MS + ENCODE_ALLOWANCE_MS - 1);
      expect(await settles(next)).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await settles(next)).toBe(true);
      expect(steps).toContain("stitch still running, turn ended without it");
      (await next)();
    } finally {
      mocks.stitchHangs = false;
      vi.useRealTimers();
    }
  });
});
