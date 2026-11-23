import { defineConfig, devices } from "@playwright/test";
import { CLICKUP_STUB_URL, E2E_AUTH_SECRET, e2eDatabaseUrl, SESSION_STATE } from "./e2e/e2e-env";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CI = Boolean(process.env.CI);
/** Refuses to start without a local E2E_DATABASE_URL: the global setup empties it. */
const DATABASE_URL = e2eDatabaseUrl();

/**
 * Runs against a production build (`next build && next start`) in its own
 * dist folder, with the widget enabled as on a Vercel preview, storing shares
 * and accounts in the e2e Postgres. The global setup empties and seeds it;
 * the `setup` project signs in once and every other project reuses that session.
 * Chromium runs every spec, on a desktop and a phone; WebKit, on a desktop and
 * an iPhone, runs only the tests tagged `@webkit`.
 * ClickUp's API is a stub on this machine (`e2e/clickup-stub.mjs`), so no test
 * reaches ClickUp.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  // CI runs in shards; each writes a blob that the `e2e-report` job merges into one HTML report.
  reporter: CI ? [["github"], ["blob"]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  globalSetup: "./e2e/global-setup.ts",
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: SESSION_STATE },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], storageState: SESSION_STATE },
      dependencies: ["setup"],
    },
    // Safari's own rules (the clipboard, for one) only for the tests tagged `@webkit`.
    {
      name: "webkit",
      grep: /@webkit/,
      use: { ...devices["Desktop Safari"], storageState: SESSION_STATE },
      dependencies: ["setup"],
    },
    {
      name: "mobile-safari",
      grep: /@webkit/,
      use: { ...devices["iPhone 15"], storageState: SESSION_STATE },
      dependencies: ["setup"],
    },
  ],
  webServer: [
    {
      command: "node e2e/clickup-stub.mjs",
      url: `${CLICKUP_STUB_URL}/health`,
      reuseExistingServer: !CI,
    },
    {
      command: `pnpm run pdfjs-assets && pnpm exec next build && pnpm exec next start --port ${PORT} --hostname 127.0.0.1`,
      url: BASE_URL,
      reuseExistingServer: !CI,
      timeout: 240_000,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        NEXT_TELEMETRY_DISABLED: "1",
        NEXT_PUBLIC_VERCEL_ENV: "preview",
        PINPOINT_REVIEW_TOKEN: "e2e-token",
        PINPOINT_ENABLE_REVIEW_LINK: "1",
        PINPOINT_RATE_LIMIT: "1000",
        // The ClickUp specs open Send to ClickUp more often in ten minutes than its limits allow.
        CLICKUP_RATE_LIMIT_MULTIPLIER: "10",
        GITHUB_TOKEN: "",
        GITHUB_REPO: "",
        // Through the process env, which beats .env.local in Next.
        DATABASE_URL,
        // Never reach real services from a test run, whatever .env.local holds.
        BLOB_READ_WRITE_TOKEN: "",
        RESEND_API_KEY: "",
        EMAIL_FROM: "",
        AUTH_URL: "",
        // Seals review link secrets in the e2e database; a test value, never a real one.
        AUTH_SECRET: E2E_AUTH_SECRET,
        // ClickUp's API is the stub's: only taken as plain http on this machine (`clickUpApiUrl`).
        CLICKUP_API_URL: `${CLICKUP_STUB_URL}/api`,
      },
    },
  ],
});
