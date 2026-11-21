import { test as base } from "@playwright/test";
import { resetWorkspace } from "./workspace-db";

/**
 * Playwright's `test`, with the e2e workspace emptied before each test, so
 * every test starts from a first visit whatever ran before it. Snapshots
 * fail fast unless a test answers them (`mockCapture`): website projects
 * capture on their own (when created, or opening on a site that refuses
 * framing), and no test may reach a real site.
 */
export const test = base.extend<{ emptyWorkspace: undefined }>({
  emptyWorkspace: [
    async ({ baseURL: _baseURL }, use) => {
      await resetWorkspace();
      await use(undefined);
    },
    { auto: true },
  ],
  // Not `use`: the hooks lint rule would take it for React's `use` hook.
  page: async ({ page }, provide) => {
    await page.route("**/api/capture", (route) =>
      route.fulfill({ status: 502, json: { error: "failed" } }),
    );
    await provide(page);
  },
});

export { expect } from "@playwright/test";
