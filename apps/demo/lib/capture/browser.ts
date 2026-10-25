import { chromium, type Browser, type LaunchOptions } from "playwright-core";
import { CaptureError } from "./capture-error";

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
  const { default: serverless } = await import("@sparticuz/chromium");
  return {
    headless: true,
    executablePath: await serverless.executablePath(),
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
      "Squint capture: Chromium could not start. Locally, run `pnpm exec playwright install chromium` in apps/demo.",
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
