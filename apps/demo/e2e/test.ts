import { test as base } from "@playwright/test";
import { resetWorkspace } from "./workspace-db";

/**
 * Playwright's `test`, with the e2e workspace emptied before each test, so
 * every test starts from a first visit whatever ran before it.
 */
export const test = base.extend<{ emptyWorkspace: undefined }>({
  emptyWorkspace: [
    async ({ baseURL: _baseURL }, use) => {
      await resetWorkspace();
      await use(undefined);
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
