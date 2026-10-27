import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createImageProject,
  createUrlProject,
  hideComments,
  mockCapture,
  mockFrameCheck,
  OVERVIEW_HEADLINE,
  openFolder,
  postComment,
  showComments,
  skipReviewGuide,
} from "./squint-fixtures";

function card(page: Page, text: string): Locator {
  return page.getByTestId("comment-card").filter({ hasText: text });
}

/** The owner's viewer pulls client comments on focus (and every 15 seconds). */
async function pullUntil(page: Page, check: Locator): Promise<void> {
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(check).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/** No way from a shared link into anyone's workspace. */
async function expectNoWorkspaceLinks(page: Page): Promise<void> {
  await expect(page.locator('a[href="/"], a[href^="/f/"], a[href^="/p/"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Back to|Overview|Squint \(home\)/ })).toHaveCount(0);
}

test("an owner shares a project, a client comments, and the owner resolves and revokes", async ({
  page,
  browser,
  baseURL,
  isMobile,
}) => {
  const frame = { verdict: "embeddable" as const, finalUrl: `${baseURL}/sandbox`, status: 200 };
  await mockFrameCheck(page, frame);
  await mockCapture(page);

  // Owner: a website project with one comment on a snapshot.
  await openFolder(page);
  await createUrlProject(page, `${baseURL}/sandbox`, "Launch review");
  await page.getByTestId("mode-comment").click();
  await expect(page.getByRole("img", { name: /^Snapshot of/ })).toBeVisible();
  await postComment(page, "Owner note", { x: 140, y: 120 }, "Ana");
  await showComments(page);
  await expect(card(page, "Owner note").getByTestId("comment-crop").locator("img")).toBeVisible();

  // Owner: create the link and wait until the snapshot and crop are uploaded.
  await page.getByTestId("share-button").click();
  const dialog = page.getByTestId("share-dialog");
  await expect(dialog).toContainText("Clients can view and add comments");
  await dialog.getByTestId("create-share-link").click();
  const urlField = dialog.getByTestId("share-url");
  await expect(urlField).toHaveValue(/\/s\/[A-Za-z0-9_-]{43}$/);
  await expect(dialog.getByRole("status").filter({ hasText: "Link created." })).toHaveCount(1);
  const link = await urlField.inputValue();
  await expect(dialog.getByTestId("sync-status")).toContainText("Synced");
  // The review window starts with the link: 72 hours, give or take the seconds since.
  await expect(dialog.getByTestId("review-window")).toContainText(
    /Clients can comment for (3 days|2 days, 23 hours)/,
  );
  await page.keyboard.press("Escape");

  // Client: a separate browser (its own storage) opens the link.
  const clientContext = await browser.newContext();
  const client = await clientContext.newPage();
  await skipReviewGuide(client);
  await mockFrameCheck(client, frame);
  await client.route("**/api/s/*/capture", (route) =>
    route.fulfill({ status: 503, json: { error: "unavailable" } }),
  );
  const opened = await client.goto(link);
  expect(opened?.status()).toBe(200);
  expect(opened?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(opened?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(client.getByRole("heading", { level: 1, name: "Launch review" })).toBeVisible();
  await expectNoWorkspaceLinks(client);
  await expect(client.getByTestId("share-button")).toHaveCount(0);
  await expect(client.getByTestId("review-countdown")).toHaveAttribute("data-state", "open");
  await expect(client.getByTestId("review-countdown")).toContainText(/(3d 0h 0m|2d 23h \d+m) left/);
  // What clients can do: in the sheet's header on phones (seen collapsed), above the list elsewhere.
  if (isMobile) await expect(client.getByTestId("panel-note")).toBeVisible();
  else await expect(client.getByTestId("client-notice")).toBeVisible();

  await showComments(client);
  const ownerNote = card(client, "Owner note");
  await expect(ownerNote).toBeVisible();
  await expect(ownerNote.getByTestId("comment-crop").locator("img")).toBeVisible();
  // Clients read and add; they don't moderate.
  await expect(ownerNote.getByRole("button", { name: /Resolve|Reopen/ })).toHaveCount(0);
  await expect(ownerNote.getByRole("button", { name: /Edit comment|Delete comment/ })).toHaveCount(
    0,
  );

  // On phones the open comments sheet covers the lower canvas; collapse it to place a pin.
  await hideComments(client);
  await client.getByTestId("mode-comment").click();
  await expect(client.getByRole("img", { name: /^Snapshot of/ })).toBeVisible();
  await expect(client.getByRole("button", { name: "Comment 1 by Ana", exact: true })).toBeVisible();

  const sent = client.waitForResponse(
    (response) => response.url().includes("/comments") && response.request().method() === "POST",
  );
  await postComment(client, "Client note", { x: 260, y: 200 }, "Cleo");
  expect((await sent).status()).toBe(201);
  await expect(
    client.getByRole("button", { name: "Comment 2 by Cleo", exact: true }),
  ).toBeVisible();

  // Owner: the client's comment arrives with its screenshot.
  const clientNote = card(page, "Client note");
  await pullUntil(page, clientNote);
  await expect(clientNote).toContainText("Cleo");
  await expect(clientNote.getByTestId("comment-crop").locator("img")).toBeVisible();

  // Owner resolves it; the change is pushed.
  const pushed = page.waitForResponse(
    (response) =>
      /\/api\/shares\/[^/]+$/.test(response.url()) && response.request().method() === "PATCH",
  );
  await clientNote.getByRole("button", { name: "Resolve" }).click();
  expect((await pushed).status()).toBe(200);

  // Client sees it resolved after a reload; still no moderation controls.
  await client.reload();
  await showComments(client);
  await client.getByTestId("tab-resolved").click();
  const resolved = card(client, "Client note");
  await expect(resolved).toBeVisible();
  await expect(resolved.getByRole("button", { name: /Reopen|Delete comment/ })).toHaveCount(0);

  // The client's own workspace is untouched: a fresh, empty Overview.
  await client.goto("/");
  await expect(client.getByRole("heading", { level: 1 })).toHaveText(OVERVIEW_HEADLINE.empty);

  // Owner revokes. A failure says so assertively and offers Retry; then the link is gone.
  await page.route("**/api/shares/*", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 500, json: { error: "x" } })
      : route.fallback(),
  );
  await page.getByTestId("share-button").click();
  await dialog.getByRole("button", { name: "Revoke link" }).click();
  await page
    .getByRole("dialog", { name: "Revoke this link?" })
    .getByRole("button", { name: "Revoke link" })
    .click();
  const failed = page
    .getByRole("alert")
    .getByTestId("toast")
    .filter({ hasText: "couldn't be revoked" });
  await expect(failed).toBeVisible();
  await page.unroute("**/api/shares/*");
  await failed.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "Link revoked" })).toBeVisible();

  const revoked = await client.goto(link);
  expect(revoked?.status()).toBe(404);
  await expect(client.getByTestId("share-unavailable")).toBeVisible();
  await expectNoWorkspaceLinks(client);
  await clientContext.close();
});

test("an unknown share link is a 404 without workspace links", async ({ page }) => {
  const response = await page.goto(`/s/${"x".repeat(43)}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByTestId("share-unavailable")).toBeVisible();
  await expectNoWorkspaceLinks(page);
  const api = await page.request.get(`/api/s/${"x".repeat(43)}`);
  expect(api.status()).toBe(404);
  expect(await api.json()).toEqual({ error: "not-found" });
});

/** An owner's website project, shared; returns the client link. */
async function sharedProject(
  page: Page,
  baseURL: string | undefined,
  name: string,
): Promise<string> {
  await mockFrameCheck(page, {
    verdict: "embeddable",
    finalUrl: `${baseURL}/sandbox`,
    status: 200,
  });
  await mockCapture(page);
  await openFolder(page);
  await createUrlProject(page, `${baseURL}/sandbox`, name);
  // A snapshot to share, so clients can comment without capturing.
  await page.getByTestId("mode-comment").click();
  await expect(page.getByRole("img", { name: /^Snapshot of/ })).toBeVisible();
  await page.getByTestId("share-button").click();
  const dialog = page.getByTestId("share-dialog");
  await dialog.getByTestId("create-share-link").click();
  const urlField = dialog.getByTestId("share-url");
  await expect(urlField).toHaveValue(/\/s\/[A-Za-z0-9_-]{43}$/);
  await expect(dialog.getByTestId("sync-status")).toContainText("Synced");
  const link = await urlField.inputValue();
  await page.keyboard.press("Escape");
  return link;
}

test("deleting a shared project revokes its link once Undo is gone", async ({ page, baseURL }) => {
  const link = await sharedProject(page, baseURL, "Short-lived");
  expect((await page.request.get(link)).status()).toBe(200);

  await page.getByRole("link", { name: "Back to My projects" }).click();
  const card = page.getByTestId("project-card").filter({ hasText: "Short-lived" });
  await card.getByTestId("project-menu").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete Short-lived?" });
  await expect(confirm).toContainText("share link will stop working");
  await confirm.getByRole("button", { name: "Delete project" }).click();

  // While Undo is offered the link still works; once the toast is gone, it doesn't.
  const toast = page.getByTestId("toast").filter({ hasText: "Deleted Short-lived" });
  await expect(toast).toBeVisible();
  expect((await page.request.get(link)).status()).toBe(200);
  await expect(toast).toHaveCount(0, { timeout: 10_000 });
  await expect
    .poll(async () => (await page.request.get(link)).status(), { timeout: 10_000 })
    .toBe(404);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (JSON.parse(localStorage.getItem("squint:v3") ?? "{}") as { revocations: unknown[] })
            .revocations.length,
      ),
    )
    .toBe(0);
});

test("a client comment that fails to send keeps its text until Retry gets it through", async ({
  page,
  browser,
  baseURL,
}) => {
  const link = await sharedProject(page, baseURL, "Flaky network");
  const clientContext = await browser.newContext();
  const client = await clientContext.newPage();
  await skipReviewGuide(client);
  await mockFrameCheck(client, {
    verdict: "embeddable",
    finalUrl: `${baseURL}/sandbox`,
    status: 200,
  });
  await client.goto(link);
  await client.getByTestId("mode-comment").click();
  await expect(client.getByRole("img", { name: /^Snapshot of/ })).toBeVisible();

  // The first post hangs a moment, then fails.
  await client.route("**/api/s/*/comments", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({ status: 503, json: { error: "unavailable" } });
  });
  await client.getByTestId("comment-overlay").click({ position: { x: 160, y: 140 } });
  const composer = client.getByTestId("composer");
  await composer.getByLabel("Your name").fill("Cleo");
  await composer.getByLabel("Comment", { exact: true }).fill("Keep this text");
  await composer.getByRole("button", { name: "Post" }).click();

  // While it's posting, Cancel waits, so a cancelled comment can't still arrive.
  const cancel = composer.getByRole("button", { name: "Cancel" });
  await expect(cancel).toHaveAttribute("aria-disabled", "true");
  await cancel.click({ force: true });
  await expect(composer).toBeVisible();

  await expect(composer.getByTestId("composer-send-error")).toContainText("wasn't sent");
  await expect(cancel).not.toHaveAttribute("aria-disabled");
  await expect(composer.getByLabel("Comment", { exact: true })).toHaveValue("Keep this text");
  await expect(client.getByTestId("draft-pin")).toHaveAttribute("data-status", "unsent");
  // Not posted: no comment exists yet (the sheet stays closed under the docked composer on phones).
  await expect(client.getByTestId("comment-card")).toHaveCount(0);

  await client.unroute("**/api/s/*/comments");
  await composer.getByRole("button", { name: "Retry" }).click();
  await expect(composer).toHaveCount(0);
  await showComments(client);
  await expect(card(client, "Keep this text")).toBeVisible();
  await expect(
    client.getByRole("button", { name: "Comment 1 by Cleo", exact: true }),
  ).toBeVisible();

  // After a failure, Cancel discards the draft as usual, and nothing is posted.
  await hideComments(client);
  await client.route("**/api/s/*/comments", (route) =>
    route.fulfill({ status: 503, json: { error: "unavailable" } }),
  );
  await client.getByTestId("comment-overlay").click({ position: { x: 220, y: 120 } });
  await composer.getByLabel("Comment", { exact: true }).fill("Never mind");
  await composer.getByRole("button", { name: "Post" }).click();
  await expect(composer.getByTestId("composer-send-error")).toBeVisible();
  await composer.getByRole("button", { name: "Cancel" }).click();
  await expect(composer).toHaveCount(0);
  await expect(client.getByTestId("draft-pin")).toHaveCount(0);
  await showComments(client);
  await expect(client.getByTestId("comment-card")).toHaveCount(1);
  await clientContext.close();
});

test("an unsent client comment survives a reload, with a warning before leaving", async ({
  page,
  browser,
  baseURL,
}) => {
  const link = await sharedProject(page, baseURL, "Draft keeper");
  const clientContext = await browser.newContext();
  const client = await clientContext.newPage();
  await skipReviewGuide(client);
  await mockFrameCheck(client, {
    verdict: "embeddable",
    finalUrl: `${baseURL}/sandbox`,
    status: 200,
  });
  await client.goto(link);
  await client.getByTestId("mode-comment").click();
  await expect(client.getByRole("img", { name: /^Snapshot of/ })).toBeVisible();
  await client.getByTestId("comment-overlay").click({ position: { x: 180, y: 150 } });
  const composer = client.getByTestId("composer");
  await composer.getByLabel("Your name").fill("Cleo");
  await composer.getByLabel("Comment", { exact: true }).fill("Half-written thought");

  // Leaving asks first while the comment is unsent.
  const warned = new Promise<string>((resolve) =>
    client.once("dialog", (dialog) => {
      resolve(dialog.type());
      void dialog.accept();
    }),
  );
  await client.reload();
  expect(await warned).toBe("beforeunload");

  // Back after the reload: the text, its pin and the snapshot it was on.
  await expect(composer.getByLabel("Comment", { exact: true })).toHaveValue("Half-written thought");
  await expect(composer.getByTestId("composer-send-error")).toContainText("wasn't sent");
  await expect(client.getByTestId("draft-pin")).toHaveAttribute("data-status", "unsent");
  await composer.getByRole("button", { name: "Retry" }).click();
  await expect(composer).toHaveCount(0);
  await showComments(client);
  await expect(card(client, "Half-written thought")).toHaveCount(1);
  await clientContext.close();
});

test("a server with nowhere lasting to keep links says so instead of creating one", async ({
  page,
}) => {
  await openFolder(page);
  await createImageProject(page, "checkout.png");
  // What a Vercel deployment without DATABASE_URL answers (see canCreateShares).
  await page.route("**/api/shares", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 503, json: { error: "storage-unavailable" } })
      : route.fallback(),
  );

  await page.getByTestId("share-button").click();
  const dialog = page.getByTestId("share-dialog");
  await dialog.getByTestId("create-share-link").click();
  await expect(dialog).toContainText("It needs a database to store links");
  await expect(dialog).not.toContainText("Check your connection");
  await expect(dialog.getByTestId("share-url")).toHaveCount(0);
});

test("an image project is shared as its page, and a client's comment comes back on it", async ({
  page,
  browser,
}) => {
  await openFolder(page);
  await createImageProject(page, "checkout.png");
  await postComment(page, "Owner note", { x: 100, y: 80 }, "Ana");

  await page.getByTestId("share-button").click();
  const dialog = page.getByTestId("share-dialog");
  await dialog.getByTestId("create-share-link").click();
  const link = await dialog.getByTestId("share-url").inputValue();
  await expect(dialog.getByTestId("sync-status")).toContainText("Synced");
  await page.keyboard.press("Escape");

  const clientContext = await browser.newContext();
  const client = await clientContext.newPage();
  await skipReviewGuide(client);
  await client.goto(link);
  await expect(client.getByRole("img", { name: /the image under review/ })).toBeVisible();
  await expect(client.getByRole("button", { name: "Comment 1 by Ana", exact: true })).toBeVisible();
  const sent = client.waitForResponse(
    (response) => response.url().includes("/comments") && response.request().method() === "POST",
  );
  await postComment(client, "Client note", { x: 160, y: 120 }, "Cleo");
  const response = await sent;
  expect(response.status()).toBe(201);
  // The comment names the page it's on, as the server requires on a page project.
  expect(await response.json()).toMatchObject({ pageId: expect.any(String) });

  await showComments(page);
  await pullUntil(page, card(page, "Client note"));
  await expect(page.getByRole("button", { name: "Comment 2 by Cleo", exact: true })).toBeVisible();
  await clientContext.close();
});

test("a client's first visit opens How it works once, and its button opens it again", async ({
  page,
  browser,
  baseURL,
}) => {
  const link = await sharedProject(page, baseURL, "Guided review");
  const clientContext = await browser.newContext();
  const client = await clientContext.newPage();
  await mockFrameCheck(client, {
    verdict: "embeddable",
    finalUrl: `${baseURL}/sandbox`,
    status: 200,
  });
  await client.goto(link);
  const guide = client.getByRole("dialog", { name: "How it works" });
  await expect(guide).toBeVisible();
  await expect(guide.getByRole("heading", { level: 3 })).toHaveText([
    "Look around",
    "Pin a comment",
    "Send feedback within 72 hours",
  ]);
  await client.keyboard.press("Escape");
  await expect(guide).toHaveCount(0);
  // Opened by itself, it hands focus to its button: the way back to it.
  const button = client.getByTestId("review-guide-button");
  await expect(button).toBeFocused();

  // Remembered in this browser: it doesn't open by itself again.
  await client.reload();
  await expect(client.getByRole("heading", { level: 1, name: "Guided review" })).toBeVisible();
  await expect(guide).toHaveCount(0);
  await button.click();
  await expect(guide).toBeVisible();
  await guide.getByTestId("review-guide-start").click();
  await expect(guide).toHaveCount(0);
  await expect(button).toBeFocused();
  await clientContext.close();
});

test("once the review window has closed, the link is read-only", async ({
  page,
  browser,
  baseURL,
  isMobile,
}) => {
  const link = await sharedProject(page, baseURL, "Closed review");
  const clientContext = await browser.newContext();
  const client = await clientContext.newPage();
  await skipReviewGuide(client);
  await mockFrameCheck(client, {
    verdict: "embeddable",
    finalUrl: `${baseURL}/sandbox`,
    status: 200,
  });
  // This browser's clock, past the 72 hours the server says the window lasts.
  await client.clock.setFixedTime(Date.now() + 73 * 60 * 60 * 1000);
  await client.goto(link);
  await expect(client.getByRole("heading", { level: 1, name: "Closed review" })).toBeVisible();
  await expect(client.getByTestId("review-countdown")).toHaveText("Review closed");
  await expect(client.getByTestId("mode-comment")).toHaveAttribute("aria-disabled", "true");
  if (isMobile) await expect(client.getByTestId("panel-note")).toContainText("has closed");
  else {
    await expect(client.getByTestId("client-notice")).toHaveAttribute("data-review", "closed");
  }

  // Neither the toggle nor its shortcut starts Comment mode. Forced: it's aria-disabled.
  await client.getByTestId("mode-comment").click({ force: true });
  await client.keyboard.press("c");
  await expect(client.getByTestId("canvas-area")).toHaveAttribute("data-mode", "browse");
  await clientContext.close();
});
