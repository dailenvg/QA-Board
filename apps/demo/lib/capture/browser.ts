import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type ServerlessChromium from "@sparticuz/chromium-min";
import { chromium, type Browser, type LaunchOptions } from "playwright-core";
import { CaptureError } from "./capture-error";
import { CHROMIUM_VERSION, chromiumPackUrl } from "./chromium-pack";
import type { StepLog } from "./step-log";
import { tmpFreeMb, tmpListing } from "./tmp-space";

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

/** Each capture gets a new profile, so a disk cache only takes room in /tmp. */
const SERVERLESS_ARGS = ["--disk-cache-size=1"];

/** The serverless Chromium launcher, shared so captures starting together download it once. */
let serverlessPath: Promise<string> | null = null;

/** Vercel functions run on AWS Lambda, where the bundled Playwright browsers don't exist. */
function onServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
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
  log(`pack ready (${process.arch}, ${tmpFreeMb()} MB free in /tmp: ${tmpListing()})`);
  return {
    headless: true,
    executablePath,
    args: [...serverless.args, ...ARGS, ...SERVERLESS_ARGS],
  };
}

/**
 * A fresh browser for one capture; the caller closes it. Serverless Chromium
 * runs as a single process, which can't open a page once an earlier context
 * has closed, so browsers are never shared between captures.
 */
export async function launchBrowser(log: StepLog): Promise<Browser> {
  try {
    const browser = await chromium.launch(await launchOptions(log));
    log("launch");
    return browser;
  } catch (error) {
    console.error(
      "Squint capture: Chromium could not start. On Vercel, check that the Chromium pack downloads (SQUINT_CHROMIUM_PACK_URL overrides its URL). Locally, run `pnpm exec playwright install chromium` in apps/demo.",
      error,
    );
    throw new CaptureError("unavailable");
  }
}
