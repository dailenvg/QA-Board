import type { Page } from "@playwright/test";
import { expect, test } from "./test";
import { SIGNED_OUT } from "./auth-fixtures";
import {
  createUrlProject,
  mockCapture,
  mockFrameCheck,
  openFolder,
  shareWorkspaceProject,
  skipReviewGuide,
} from "./squint-fixtures";

function loginState(page: Page) {
  return page.getByTestId("capture-failed").and(page.locator('[data-reason="login-page"]'));
}

test("a site behind a login shows a warning with no canvas to pin on, and Try again captures again", async ({
  page,
  baseURL,
}) => {
  await mockFrameCheck(page, {
    verdict: "embeddable",
    finalUrl: `${baseURL}/sandbox`,
    status: 200,
  });
  let captures = await mockCapture(page, { failWith: "login-page" });
  await openFolder(page);
  await createUrlProject(page, `${baseURL}/sandbox`, "Staging site");
  await page.getByTestId("mode-comment").click();

  const warning = loginState(page);
  await expect(warning).toContainText("This site is behind a login");
  await expect(warning.getByTestId("screenshot-input")).toBeAttached();
  await expect(warning.getByText("Upload a screenshot", { exact: true })).toBeVisible();
  await expect(page.getByTestId("comment-overlay")).toHaveCount(0);
  await expect(page.getByRole("img", { name: /^Snapshot of/ })).toHaveCount(0);

  const asked = captures();
  await warning.getByRole("button", { name: "Try again" }).click();
  await expect.poll(captures).toBe(asked + 1);
  await expect(warning).toBeVisible();

  captures = await mockCapture(page);
  await warning.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("img", { name: /^Snapshot of/ })).toBeVisible();
  await expect(warning).toHaveCount(0);
  expect(captures()).toBe(1);
});

test("a guest on a site behind a login gets Try again, not an upload", async ({
  page,
  browser,
}) => {
  const { token } = await shareWorkspaceProject(page, "Guarded launch");
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const guest = await context.newPage();
  await skipReviewGuide(guest);
  await mockFrameCheck(guest, {
    verdict: "embeddable",
    finalUrl: "https://example.com/",
    status: 200,
  });
  let asked = 0;
  await guest.route("**/api/s/*/capture", (route) => {
    asked += 1;
    return route.fulfill({ status: 422, json: { error: "login-page" } });
  });
  await guest.goto(`/s/${token}`);
  await guest.getByTestId("mode-comment").click();

  const warning = loginState(guest);
  await expect(warning).toContainText("This site is behind a login");
  await expect(warning.getByTestId("screenshot-input")).toHaveCount(0);
  await expect(guest.getByTestId("comment-overlay")).toHaveCount(0);

  const before = asked;
  await warning.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => asked).toBe(before + 1);
  await expect(warning).toBeVisible();
  await context.close();
});
