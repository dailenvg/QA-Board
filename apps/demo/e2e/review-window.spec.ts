import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./test";
import { SIGNED_OUT } from "./auth-fixtures";
import {
  createUrlProject,
  mockCapture,
  mockFrameCheck,
  openFolder,
  shareWorkspaceProject,
  showShareTab,
  skipReviewGuide,
} from "./squint-fixtures";
import { ageShareLink, shareWindowHours } from "./workspace-db";

const EMBEDDABLE = (baseURL: string | undefined) => ({
  verdict: "embeddable" as const,
  finalUrl: `${baseURL}/sandbox`,
  status: 200,
});

/** A signed-out browser of its own on the link, past the review guide. */
async function openAsGuest(browser: Browser, link: string, baseURL: string | undefined) {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const guest = await context.newPage();
  await skipReviewGuide(guest);
  await mockFrameCheck(guest, EMBEDDABLE(baseURL));
  await guest.route("https://example.com/**", (route) => route.abort());
  expect((await guest.goto(link))?.status()).toBe(200);
  return { context, guest };
}

/** Waits for the share dialog's window change to reach the server. */
function windowSaved(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.url().endsWith("/share-link/settings") && response.request().method() === "PATCH",
  );
}

/** The guest's link refreshes on focus: until `state` shows on the countdown. */
async function refreshUntil(guest: Page, state: "open" | "closed"): Promise<void> {
  await expect(async () => {
    await guest.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(guest.getByTestId("review-countdown")).toHaveAttribute("data-state", state, {
      timeout: 1_000,
    });
  }).toPass({ timeout: 15_000 });
}

test("a link made for 24 hours says so, and No limit takes the guest's countdown away", async ({
  page,
  browser,
  baseURL,
}) => {
  await mockFrameCheck(page, EMBEDDABLE(baseURL));
  await mockCapture(page);
  await openFolder(page);
  await createUrlProject(page, `${baseURL}/sandbox`, "Window review");
  await page.getByTestId("mode-comment").click();
  await expect(page.getByRole("img", { name: /^Snapshot of/ })).toBeVisible();

  // Chosen before the link exists: 3 days unless changed.
  await page.getByTestId("share-button").click();
  const dialog = page.getByTestId("share-dialog");
  const window72 = dialog.getByTestId("review-window-72h");
  await expect(window72).toHaveAttribute("aria-checked", "true");
  await dialog.getByTestId("review-window-24h").click();
  await expect(dialog.getByTestId("review-window-24h")).toHaveAttribute("aria-checked", "true");
  await dialog.getByTestId("create-share-link").click();
  const urlField = dialog.getByTestId("share-url");
  await expect(urlField).toHaveValue(/\/s\/[A-Za-z0-9_-]{43}$/);
  await expect(dialog.getByTestId("sync-status")).toContainText("Synced");
  const link = await urlField.inputValue();
  await showShareTab(dialog, "settings");
  // The link's own settings (the Create view may still be fading out).
  const settings = dialog.getByTestId("share-settings-step");
  await expect(settings.getByTestId("review-window-24h")).toHaveAttribute("aria-checked", "true");
  await expect(dialog.getByTestId("review-window")).toContainText(
    /Open until .+\. Clients can comment for (1 day|23 hours)/,
  );

  const { context, guest } = await openAsGuest(browser, link, baseURL);
  await expect(guest.getByTestId("review-countdown")).toContainText(/(1d 0h 0m|23h \d+m) left/);

  // No limit: the owner's dialog and the server say so, and the guest's countdown goes.
  const saved = windowSaved(page);
  await settings.getByTestId("review-window-none").click();
  expect((await saved).status()).toBe(200);
  await expect(dialog.getByTestId("review-window")).toContainText("No time limit.");
  await expect(settings.getByTestId("review-window-none")).toHaveAttribute("aria-checked", "true");

  await guest.reload();
  await expect(guest.getByRole("heading", { level: 1, name: "Window review" })).toBeVisible();
  await expect(guest.getByTestId("review-countdown")).toHaveCount(0);
  await expect(guest.getByTestId("mode-comment")).not.toHaveAttribute("aria-disabled", "true");
  await context.close();
});

test("shortening an old link past its age asks first and closes it; a longer window reopens it", async ({
  page,
  browser,
  baseURL,
}) => {
  const { token, projectId } = await shareWorkspaceProject(page, "Aged review");
  // Created 30 hours ago: 42 of its 72 hours are left.
  await ageShareLink(projectId, 30);
  const { context, guest } = await openAsGuest(browser, `${baseURL}/s/${token}`, baseURL);
  await expect(guest.getByTestId("review-countdown")).toHaveAttribute("data-state", "open");

  await mockFrameCheck(page, {
    verdict: "embeddable",
    finalUrl: "https://example.com/",
    status: 200,
  });
  await page.route("https://example.com/**", (route) => route.abort());
  await page.goto(`/p/${projectId}`);
  await page.getByTestId("share-button").click();
  const dialog = page.getByTestId("share-dialog");
  await showShareTab(dialog, "settings");
  await expect(dialog.getByTestId("review-window")).toContainText(
    /Clients can comment for 1 day(,| and) 1[78] hours/,
  );

  // 24 hours ended six hours ago: the owner is asked before the review closes.
  await dialog.getByTestId("review-window-24h").click();
  const confirm = page.getByRole("dialog", { name: "Close the review now?" });
  await expect(confirm).toContainText("more than 24 hours ago");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog.getByTestId("review-window-72h")).toHaveAttribute("aria-checked", "true");
  expect(await shareWindowHours(projectId)).toBe(72);

  await dialog.getByTestId("review-window-24h").click();
  const saved = windowSaved(page);
  await confirm.getByRole("button", { name: "Change and close review" }).click();
  expect((await saved).status()).toBe(200);
  expect(await shareWindowHours(projectId)).toBe(24);
  await expect(dialog.getByTestId("review-window")).toContainText("choose a longer window");

  // The guest's next refresh brings the new deadline: read-only from then on.
  await refreshUntil(guest, "closed");
  await expect(guest.getByTestId("review-countdown")).toHaveText("Review closed");
  await expect(guest.getByTestId("mode-comment")).toHaveAttribute("aria-disabled", "true");

  // Extending needs no confirmation, and the review opens again.
  const extended = windowSaved(page);
  await dialog.getByTestId("review-window-7d").click();
  expect((await extended).status()).toBe(200);
  await expect(page.getByRole("dialog", { name: "Close the review now?" })).toHaveCount(0);
  await expect(dialog.getByTestId("review-window")).toContainText(/Clients can comment for 5 days/);
  await refreshUntil(guest, "open");
  await expect(guest.getByTestId("mode-comment")).not.toHaveAttribute("aria-disabled", "true");
  await context.close();
});
