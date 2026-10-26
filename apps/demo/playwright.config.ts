import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CI = Boolean(process.env.CI);

/**
 * Runs against a production build (`next build && next start`) in its own
 * dist folder, with the widget enabled as on a Vercel preview and memory storage.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm run pdfjs-assets && pnpm exec next build && pnpm exec next start --port ${PORT} --hostname 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !CI,
    timeout: 240_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_VERCEL_ENV: "preview",
      NEXT_PUBLIC_SQUINT_E2E: "1",
      PINPOINT_REVIEW_TOKEN: "e2e-token",
      PINPOINT_ENABLE_REVIEW_LINK: "1",
      PINPOINT_RATE_LIMIT: "1000",
      GITHUB_TOKEN: "",
      GITHUB_REPO: "",
      DATABASE_URL: "",
    },
  },
});
