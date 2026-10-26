import { chromium, type Browser, type LaunchOptions } from "playwright-core";
import { CaptureError } from "./capture-error";
import { CHROMIUM_VERSION, chromiumPackUrl } from "./chromium-pack";
import type { StepLog } from "./step-log";

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

/** The unpacked serverless Chromium, shared so captures starting together download it once. */
let serverlessPath: Promise<string> | null = null;

/** Vercel functions run on AWS Lambda, where the bundled Playwright browsers don't exist. */
function onServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

async function launchOptions(log: StepLog): Promise<LaunchOptions> {
  if (!onServerless()) return { headless: true, args: ARGS };
  // Downloads the pack for this function's architecture once per instance; later launches
  // reuse the copy in /tmp.
  const { default: serverless } = await import("@sparticuz/chromium-min");
  const packUrl = chromiumPackUrl(CHROMIUM_VERSION, process.arch, process.env);
  serverlessPath ??= serverless.executablePath(packUrl).catch((error: unknown) => {
    serverlessPath = null;
    throw error;
  });
  const executablePath = await serverlessPath;
  log(`pack ready (${process.arch})`);
  return { headless: true, executablePath, args: [...serverless.args, ...ARGS] };
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
