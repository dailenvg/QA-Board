import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test as setup } from "@playwright/test";
import { E2E_COMPANY, SESSION_STATE } from "./e2e-env";
import { signIn } from "./auth-fixtures";

/**
 * Signs in once through /login as the e2e workspace owner and saves the
 * session cookie for every project. Cookies only: each test still starts with
 * empty localStorage, as the dashboard specs expect.
 */
setup("sign in as the e2e workspace owner", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, E2E_COMPANY);
  await expect(page).toHaveURL(/\/$/);
  const { cookies } = await page.context().storageState();
  mkdirSync(dirname(SESSION_STATE), { recursive: true });
  writeFileSync(SESSION_STATE, JSON.stringify({ cookies, origins: [] }, null, 2));
});
