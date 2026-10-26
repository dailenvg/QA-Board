import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type ServerlessChromium from "@sparticuz/chromium-min";
import { chromium, type Browser, type BrowserServer, type LaunchOptions } from "playwright-core";
import { CaptureError } from "./capture-error";
import { CHROMIUM_VERSION, chromiumPackUrl } from "./chromium-pack";
import { delay } from "./delay";
import { safeError } from "./safe-error";
import type { StepLog } from "./step-log";
import { tmpFreeMb } from "./tmp-space";
import { whenAborted } from "./when-aborted";

/**
 * Keeps every connection on the guard proxy: no background services, no QUIC
 * (it can't be proxied), and no WebRTC over UDP outside the proxy.
 */
const ARGS = [
  "--disable-background-networking",
  "--dns-prefetch-disable",
  "--no-pings",
  "--disable-quic",
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
];

const LAUNCH_TIMEOUT_MS = 15_000;
/** How long a graceful close gets before Chromium is killed. */
const GRACEFUL_CLOSE_MS = 2_000;
/** The longest closing a browser takes, kill included. */
export const CLOSE_LIMIT_MS = 3_000;

/** A launched capture browser and the one way to close it. */
export interface CaptureBrowser {
  browser: Browser;
  /** Closes Chromium (killing it if needed) within `CLOSE_LIMIT_MS`; safe to call twice. */
  close: () => Promise<void>;
}

/** Each capture gets a new profile, so a disk cache only takes room in /tmp. */
const SERVERLESS_ARGS = ["--disk-cache-size=1"];

/** The serverless Chromium launcher, shared so captures starting together download it once. */
let serverlessPath: Promise<string> | null = null;

/** The serverless browser that runs last; the next one starts once it settles. */
let lastTurn: Promise<void> = Promise.resolve();

/** Vercel functions run on AWS Lambda, where the bundled Playwright browsers don't exist. */
function onServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/**
 * Waits until this capture may run a browser and returns the call that ends its
 * turn. Serverless browsers take turns: /tmp has room for one full-page
 * screenshot at a time. Locally captures run side by side.
 */
export async function browserTurn(): Promise<() => void> {
  if (!onServerless()) return () => {};
  const previous = lastTurn;
  let end = () => {};
  lastTurn = new Promise((resolve) => {
    end = resolve;
  });
  await previous;
  return end;
}

/**
 * Unpacks Chromium into /tmp, which it shares with each browser's profile and
 * shared memory (512 MB in all), and returns a launcher with core dumps off:
 * single-process Chromium can crash while closing, and each dump left over
 * 100 MB in /tmp, enough to fail the next full-page screenshot.
 */
async function unpack(serverless: typeof ServerlessChromium, packUrl: string): Promise<string> {
  const binary = await serverless.executablePath(packUrl);
  // Launches only use the unpacked files.
  await rm(join(tmpdir(), "chromium-pack"), { recursive: true, force: true });
  const launcher = join(tmpdir(), "chromium-launcher.sh");
  await writeFile(launcher, `#!/bin/sh\nulimit -c 0\nexec "${binary}" "$@"\n`, { mode: 0o755 });
  return launcher;
}

async function launchOptions(log: StepLog): Promise<LaunchOptions> {
  if (!onServerless()) return { headless: true, args: ARGS };
  // Downloads the pack for this function's architecture once per instance; later launches
  // reuse the copy in /tmp.
  const { default: serverless } = await import("@sparticuz/chromium-min");
  // No SwiftShader GL: it made full-page screenshots of long pages take over 10 s.
  // Without it Chromium falls back to its software compositor (and pages get no WebGL).
  serverless.setGraphicsMode = false;
  const packUrl = chromiumPackUrl(CHROMIUM_VERSION, process.arch, process.env);
  serverlessPath ??= unpack(serverless, packUrl).catch((error: unknown) => {
    serverlessPath = null;
    throw error;
  });
  const executablePath = await serverlessPath;
  log(`pack ready (${process.arch}, ${tmpFreeMb()} MB free in /tmp)`);
  return {
    headless: true,
    executablePath,
    args: [...serverless.args, ...ARGS, ...SERVERLESS_ARGS],
  };
}

/**
 * Closes Chromium, and kills it if a graceful close hasn't finished within
 * `GRACEFUL_CLOSE_MS` (a hung single-process browser can stall it). Settles
 * within `CLOSE_LIMIT_MS` either way.
 */
export async function closeOrKill(server: BrowserServer, log: StepLog): Promise<void> {
  const graceful = server.close().then(
    () => true,
    () => false,
  );
  if (await Promise.race([graceful, delay(GRACEFUL_CLOSE_MS, false)])) {
    log("closed");
    return;
  }
  // The serverless launcher execs Chromium, so this pid is the browser itself there too.
  server.process().kill("SIGKILL");
  log("killed");
  await Promise.race([graceful, delay(CLOSE_LIMIT_MS - GRACEFUL_CLOSE_MS, false)]);
}

async function start(log: StepLog): Promise<CaptureBrowser> {
  const server = await chromium.launchServer({
    ...(await launchOptions(log)),
    timeout: LAUNCH_TIMEOUT_MS,
  });
  try {
    const browser = await chromium.connect(server.wsEndpoint(), { timeout: LAUNCH_TIMEOUT_MS });
    log("launch");
    let closing: Promise<void> | null = null;
    return { browser, close: () => (closing ??= closeOrKill(server, log)) };
  } catch (error) {
    server.process().kill("SIGKILL");
    throw error;
  }
}

/**
 * A fresh browser for one capture; the caller closes it. Serverless Chromium
 * runs as a single process, which can't open a page once an earlier context
 * has closed, so browsers are never shared between captures. Aborting
 * `signal` gives up on the launch (and the pack download) at once.
 */
export async function launchBrowser(log: StepLog, signal: AbortSignal): Promise<CaptureBrowser> {
  const starting = start(log);
  try {
    return await Promise.race([starting, whenAborted(signal)]);
  } catch (error) {
    if (signal.aborted) {
      // The launch may still land; close that browser when it does.
      void starting.then(
        (launched) => launched.close(),
        () => undefined,
      );
      throw new CaptureError("timeout");
    }
    console.error(
      "Squint capture: Chromium could not start. On Vercel, check that the Chromium pack downloads (SQUINT_CHROMIUM_PACK_URL overrides its URL). Locally, run `pnpm exec playwright install chromium` in apps/demo.",
      safeError(error),
    );
    throw new CaptureError("unavailable");
  }
}
