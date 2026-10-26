import { chromium, type Browser, type LaunchOptions } from "playwright-core";
import { CaptureError } from "./capture-error";
import { CHROMIUM_VERSION, chromiumPackUrl } from "./chromium-pack";

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

const holder = globalThis as typeof globalThis & { squintBrowser?: Promise<Browser> | null };

/** Vercel functions run on AWS Lambda, where the bundled Playwright browsers don't exist. */
function onServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

async function launchOptions(): Promise<LaunchOptions> {
  if (!onServerless()) return { headless: true, args: ARGS };
  // Downloads the pack for this function's architecture (Vercel runs arm64) once per instance;
  // warm starts reuse the copy in /tmp.
  const { default: serverless } = await import("@sparticuz/chromium-min");
  const packUrl = chromiumPackUrl(CHROMIUM_VERSION, process.arch, process.env);
  return {
    headless: true,
    executablePath: await serverless.executablePath(packUrl),
    args: [...serverless.args, ...ARGS],
  };
}

async function launch(): Promise<Browser> {
  try {
    const browser = await chromium.launch(await launchOptions());
    browser.on("disconnected", () => {
      holder.squintBrowser = null;
    });
    return browser;
  } catch (error) {
    holder.squintBrowser = null;
    console.error(
      "Squint capture: Chromium could not start. On Vercel, check that the Chromium pack downloads (SQUINT_CHROMIUM_PACK_URL overrides its URL). Locally, run `pnpm exec playwright install chromium` in apps/demo.",
      error,
    );
    throw new CaptureError("unavailable");
  }
}

/**
 * One shared browser per server instance (kept on `globalThis` so dev
 * reloads don't leak processes); each capture gets its own context.
 */
export function getBrowser(): Promise<Browser> {
  holder.squintBrowser ??= launch();
  return holder.squintBrowser;
}
