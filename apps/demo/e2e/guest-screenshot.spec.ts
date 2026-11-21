import type { Browser, Locator, Page, Response } from "@playwright/test";
import { expect, test } from "./test";
import { SIGNED_OUT } from "./auth-fixtures";
import {
  dropPin,
  hideComments,
  shareImageProject,
  showComments,
  skipReviewGuide,
} from "./squint-fixtures";

const COMMENTS = "**/api/s/*/comments";

function card(page: Page, text: string): Locator {
  return page.getByTestId("comment-card").filter({ hasText: text });
}

/** A signed-out browser of its own on the link, past the review guide. */
async function openAsGuest(browser: Browser, link: string) {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const guest = await context.newPage();
  await skipReviewGuide(guest);
  await guest.goto(link);
  await expect(guest.getByRole("img", { name: /the image under review/ })).toBeVisible();
  return { context, guest };
}

/** The next comment post's answer. */
function nextPost(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) => response.url().endsWith("/comments") && response.request().method() === "POST",
  );
}

/** The owner's viewer pulls client comments on focus (and every 15 seconds). */
async function pullUntil(page: Page, check: Locator): Promise<void> {
  await showComments(page);
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(check).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/** Writes a comment at `position`, with the name the first time, without sending it. */
async function writeComment(guest: Page, body: string, position: { x: number; y: number }) {
  await hideComments(guest);
  const composer = await dropPin(guest, position);
  const name = composer.getByLabel("Your name");
  if (await name.isVisible()) await name.fill("Cleo");
  await composer.getByLabel("Comment", { exact: true }).fill(body);
  return composer;
}

/** The toast a comment posted without its screenshot brings. */
function withoutScreenshotToast(page: Page): Locator {
  return page.getByTestId("toast").filter({ hasText: "without its screenshot" });
}

/**
 * The toast says it, then leaves on its own (after 4 s) before anything else is clicked: on
 * phones it sits over the comments sheet's toggle, and a pointer on it keeps it up.
 */
async function expectToldWithoutScreenshot(page: Page) {
  const toast = withoutScreenshotToast(page);
  await expect(toast).toHaveText("Comment posted without its screenshot.");
  await expect(toast).toHaveCount(0, { timeout: 8_000 });
}

/** The comment shows its screenshot, not the pending mark. */
async function expectScreenshot(page: Page, text: string) {
  await showComments(page);
  await expect(card(page, text).getByTestId("comment-crop").locator("img")).toBeVisible();
  await expect(card(page, text).getByTestId("screenshot-pending")).toHaveCount(0);
}

/** The comment shows the pending mark where its screenshot would be. */
async function expectPending(page: Page, text: string) {
  await showComments(page);
  await expect(card(page, text).getByTestId("screenshot-pending")).toHaveText("Screenshot pending");
  await expect(card(page, text).getByTestId("comment-crop")).toHaveCount(0);
}

test("a guest's first comment after reopening the link keeps its screenshot", async ({
  page,
  browser,
}) => {
  const link = await shareImageProject(page, "reopen.png");
  const { context, guest } = await openAsGuest(browser, link);

  // Written, then the page closes before it's sent: reopening brings it back unsent.
  await writeComment(guest, "Written before closing", { x: 160, y: 120 });
  guest.once("dialog", (dialog) => void dialog.accept());
  await guest.reload();
  const composer = guest.getByTestId("composer");
  await expect(composer.getByLabel("Comment", { exact: true })).toHaveValue(
    "Written before closing",
  );
  const posted = nextPost(guest);
  await composer.getByRole("button", { name: "Retry" }).click();
  const answer = await posted;
  expect(answer.status()).toBe(201);
  expect(((await answer.json()) as { crop?: unknown }).crop).toBeTruthy();
  await expect(composer).toHaveCount(0);
  await expect(withoutScreenshotToast(guest)).toHaveCount(0);
  await expectScreenshot(guest, "Written before closing");

  // The first comment in a newly opened tab has its screenshot too.
  const tab = await context.newPage();
  await skipReviewGuide(tab);
  await tab.goto(link);
  await expect(tab.getByRole("img", { name: /the image under review/ })).toBeVisible();
  const fresh = await writeComment(tab, "First in a new tab", { x: 220, y: 180 });
  await fresh.getByLabel("Comment", { exact: true }).press("Enter");
  await expect(fresh).toHaveCount(0);
  await expect(withoutScreenshotToast(tab)).toHaveCount(0);
  await expectScreenshot(tab, "First in a new tab");

  // The owner gets both with their screenshots.
  await pullUntil(page, card(page, "First in a new tab"));
  await expectScreenshot(page, "Written before closing");
  await expectScreenshot(page, "First in a new tab");
  await context.close();
});

test("a screenshot that won't upload is retried, then the comment posts marked pending for guest and owner", async ({
  page,
  browser,
}) => {
  const link = await shareImageProject(page, "upload-fails.png");
  const { context, guest } = await openAsGuest(browser, link);
  // Every try with the screenshot fails; the one without it goes through.
  let tries = 0;
  await guest.route(COMMENTS, (route) => {
    tries += 1;
    return tries <= 3
      ? route.fulfill({ status: 503, json: { error: "storage-unavailable" } })
      : route.fallback();
  });

  const composer = await writeComment(guest, "Upload keeps failing", { x: 160, y: 120 });
  await composer.getByLabel("Comment", { exact: true }).press("Enter");
  await expect(composer.getByRole("button", { name: "Posting…" })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(composer).toHaveCount(0);
  expect(tries).toBe(4);
  await expectToldWithoutScreenshot(guest);
  await expectPending(guest, "Upload keeps failing");

  // It stays pending after a reload: the link says so, not just this tab.
  await guest.reload();
  await expectPending(guest, "Upload keeps failing");

  await pullUntil(page, card(page, "Upload keeps failing"));
  await expectPending(page, "Upload keeps failing");
  await expect(card(page, "Upload keeps failing").getByTestId("client-chip")).toHaveText("Client");
  await context.close();
});

test("a screenshot that won't render says so on Send, then the comment posts marked pending", async ({
  page,
  browser,
}) => {
  const link = await shareImageProject(page, "render-fails.png");
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const guest = await context.newPage();
  await skipReviewGuide(guest);
  // The browser can't encode the crop: every render comes back empty.
  await guest.addInitScript(() => {
    HTMLCanvasElement.prototype.toBlob = function toBlob(callback: BlobCallback) {
      setTimeout(() => callback(null), 50);
    };
  });
  await guest.goto(link);
  await expect(guest.getByRole("img", { name: /the image under review/ })).toBeVisible();

  const composer = await writeComment(guest, "Render keeps failing", { x: 160, y: 120 });
  const posted = nextPost(guest);
  await composer.getByLabel("Comment", { exact: true }).press("Enter");
  await expect(composer.getByRole("button", { name: "Adding screenshot…" })).toBeVisible();
  expect((await posted).status()).toBe(201);
  await expect(composer).toHaveCount(0);
  await expectToldWithoutScreenshot(guest);
  await expectPending(guest, "Render keeps failing");
  await context.close();
});

test("a send that can't reach the server ends with Retry, never stuck, and Retry posts its screenshot", async ({
  page,
  browser,
}) => {
  const link = await shareImageProject(page, "offline.png");
  const { context, guest } = await openAsGuest(browser, link);
  await guest.route(COMMENTS, (route) => route.abort("internetdisconnected"));

  const composer = await writeComment(guest, "Sent while offline", { x: 160, y: 120 });
  await composer.getByLabel("Comment", { exact: true }).press("Enter");
  await expect(composer.getByTestId("composer-send-error")).toContainText("couldn't reach");
  const retry = composer.getByRole("button", { name: "Retry" });
  await expect(retry).not.toHaveAttribute("aria-busy", "true");

  await guest.unroute(COMMENTS);
  const posted = nextPost(guest);
  await retry.click();
  expect((await posted).status()).toBe(201);
  await expect(composer).toHaveCount(0);
  await expect(withoutScreenshotToast(guest)).toHaveCount(0);
  await expectScreenshot(guest, "Sent while offline");
  await context.close();
});

test("a send that's taking long says so, keeps its fields read-only, and frees them once Retry shows", async ({
  page,
  browser,
}) => {
  // A real 10 s threshold, then the retries: longer than the default 30 s with the setup.
  test.setTimeout(90_000);
  const link = await shareImageProject(page, "slow.png");
  const { context, guest } = await openAsGuest(browser, link);
  // The first try stalls past the slow-send line, then fails; the rest fail at once.
  let tries = 0;
  await guest.route(COMMENTS, async (route) => {
    tries += 1;
    if (tries === 1) await new Promise((resolve) => setTimeout(resolve, 11_000));
    await route.fulfill({ status: 503, json: { error: "unavailable" } });
  });

  const composer = await writeComment(guest, "On a slow network", { x: 160, y: 120 });
  const name = composer.getByLabel("Your name");
  const words = composer.getByLabel("Comment", { exact: true });
  await words.press("Enter");
  await expect(composer.getByTestId("composer-status")).toHaveText("Posting…");
  await expect(name).not.toBeEditable();
  await expect(words).not.toBeEditable();
  await expect(composer.getByTestId("composer-slow")).toHaveCount(0);

  const slow = "Taking longer than usual. Keep this page open until your comment is posted.";
  await expect(composer.getByTestId("composer-slow")).toHaveText(slow, { timeout: 12_000 });
  await expect(composer.getByTestId("composer-status")).toHaveText(slow);

  // Every try failed: Retry, the line and status gone, the fields editable again.
  const retry = composer.getByRole("button", { name: "Retry" });
  await expect(retry).toBeVisible({ timeout: 10_000 });
  await expect(composer.getByTestId("composer-slow")).toHaveCount(0);
  await expect(composer.getByTestId("composer-status")).toHaveText("");
  await expect(name).toBeEditable();
  await expect(words).toBeEditable();
  await words.fill("On a slow network, edited");

  await guest.unroute(COMMENTS);
  await retry.click();
  await expect(composer).toHaveCount(0);
  await expect(withoutScreenshotToast(guest)).toHaveCount(0);
  await expectScreenshot(guest, "On a slow network, edited");
  await context.close();
});
