import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./test";
import { SIGNED_OUT } from "./auth-fixtures";
import {
  createImageProject,
  createUrlProject,
  dropPin,
  hideComments,
  mockCapture,
  mockFrameCheck,
  openFolder,
  postComment,
  shareImageProject,
  showComments,
  showShareTab,
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
  const urlField = dialog.getByTestId("copy-share-link");
  await expect(urlField).toHaveAttribute("data-url", /\/s\/[A-Za-z0-9_-]{43}$/);
  await expect(dialog.getByRole("status").filter({ hasText: "Link created." })).toHaveCount(1);
  const link = (await urlField.getAttribute("data-url"))!;
  await expect(dialog.getByTestId("share-sync")).toHaveAttribute("data-sync", "synced");
  // The review window starts with the link: 3 days, give or take the seconds since.
  await showShareTab(dialog, "settings");
  await expect(dialog.getByTestId("review-window")).toContainText(
    /Clients can comment for (3 days|2 days, 23 hours)/,
  );
  await page.keyboard.press("Escape");

  // Client: a separate browser (its own storage) opens the link.
  const clientContext = await browser.newContext({ storageState: SIGNED_OUT });
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

  // The guest's own view never marks comments as a client's.
  await expect(client.getByTestId("client-chip")).toHaveCount(0);

  // Owner: the client's comment arrives with its screenshot, marked as a client's.
  const clientNote = card(page, "Client note");
  await pullUntil(page, clientNote);
  await expect(clientNote).toContainText("Cleo");
  await expect(clientNote.getByTestId("comment-crop").locator("img")).toBeVisible();
  await expect(clientNote.getByTestId("client-chip")).toHaveText("Client");
  await expect(card(page, "Owner note").getByTestId("client-chip")).toHaveCount(0);

  // Owner resolves it; the workspace save is what resolves a client's comment on the link.
  const saved = page.waitForResponse(
    (response) =>
      /\/api\/w\/[^/]+\/projects\/[^/]+\/comments\/[^/]+$/.test(response.url()) &&
      response.request().method() === "PATCH",
  );
  await clientNote.getByRole("button", { name: "Resolve" }).click();
  expect((await saved).status()).toBe(200);

  // Client sees it resolved after a reload; still no moderation controls.
  await client.reload();
  await showComments(client);
  await client.getByTestId("tab-resolved").click();
  const resolved = card(client, "Client note");
  await expect(resolved).toBeVisible();
  await expect(resolved.getByRole("button", { name: /Reopen|Delete comment/ })).toHaveCount(0);

  // The link is all a guest has: the workspace itself asks them to sign in.
  await client.goto("/");
  await expect(client).toHaveURL(/\/login/);

  // Owner revokes (through the workspace). A failure says so assertively and offers Retry;
  // then the link is gone.
  await page.route("**/api/w/*/projects/*/share-link", (route) =>
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
  await page.unroute("**/api/w/*/projects/*/share-link");
  await failed.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "Link revoked" })).toBeVisible();
  // Revoking closes the window rather than making a new link straight away.
  await expect(dialog).toBeHidden();

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
  const urlField = dialog.getByTestId("copy-share-link");
  await expect(urlField).toHaveAttribute("data-url", /\/s\/[A-Za-z0-9_-]{43}$/);
  await expect(dialog.getByTestId("share-sync")).toHaveAttribute("data-sync", "synced");
  const link = (await urlField.getAttribute("data-url"))!;
  await page.keyboard.press("Escape");
  return link;
}

test("deleting a shared project stops its link, and Undo brings it back", async ({
  page,
  baseURL,
}) => {
  const link = await sharedProject(page, baseURL, "Short-lived");
  expect((await page.request.get(link)).status()).toBe(200);

  await page.getByRole("link", { name: "Back to My projects" }).click();
  const card = page.getByTestId("project-card").filter({ hasText: "Short-lived" });
  await card.getByTestId("project-menu").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete Short-lived?" });
  await expect(confirm).toContainText("share link will stop working");
  await confirm.getByRole("button", { name: "Delete project" }).click();

  // The project is in the workspace's trash: its link answers 404 until it's restored.
  const toast = page.getByTestId("toast").filter({ hasText: "Deleted Short-lived" });
  await expect(toast).toBeVisible();
  await expect.poll(async () => (await page.request.get(link)).status()).toBe(404);
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(card).toBeVisible();
  await expect.poll(async () => (await page.request.get(link)).status()).toBe(200);
});

test("a client comment that fails to send keeps its text until Retry gets it through", async ({
  page,
  browser,
  baseURL,
}) => {
  const link = await sharedProject(page, baseURL, "Flaky network");
  const clientContext = await browser.newContext({ storageState: SIGNED_OUT });
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

  // Each try fails: three with the screenshot (a short backoff between them), then one without.
  const retried = { timeout: 10_000 };
  await expect(composer.getByTestId("composer-send-error")).toContainText("wasn't sent", retried);
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
  await expect(composer.getByTestId("composer-send-error")).toBeVisible(retried);
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
  const clientContext = await browser.newContext({ storageState: SIGNED_OUT });
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
  // Opening it tries to make the link and says why it couldn't, with a way to try again.
  await expect(dialog).toContainText("It needs a database to store links");
  await expect(dialog).not.toContainText("Check your connection");
  await expect(dialog.getByTestId("create-share-link")).toHaveText("Try again");
  await expect(dialog.getByTestId("copy-share-link")).toHaveCount(0);
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
  const link = (await dialog.getByTestId("copy-share-link").getAttribute("data-url"))!;
  await expect(dialog.getByTestId("share-sync")).toHaveAttribute("data-sync", "synced");
  await page.keyboard.press("Escape");

  const clientContext = await browser.newContext({ storageState: SIGNED_OUT });
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

test("a guest reads the team's reply under a comment, and can't edit or delete it", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One desktop browser is enough for this.");
  await openFolder(page);
  await createImageProject(page, "thread.png");
  await postComment(page, "Owner note", { x: 100, y: 80 }, "Ana");
  await showComments(page);
  const ownerCard = card(page, "Owner note");
  await ownerCard.getByRole("button", { name: "Reply", exact: true }).click();
  const box = ownerCard.getByRole("textbox", { name: "Reply", exact: true });
  const posted = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/replies") &&
      response.request().method() === "POST",
  );
  await box.fill("On it.");
  await box.press("Enter");
  expect((await posted).status()).toBe(201);

  // The link is made after the reply, so its first push carries the comment, then the reply.
  await page.getByTestId("share-button").click();
  const dialog = page.getByTestId("share-dialog");
  const link = (await dialog.getByTestId("copy-share-link").getAttribute("data-url"))!;
  await expect(dialog.getByTestId("share-sync")).toHaveAttribute("data-sync", "synced");
  await page.keyboard.press("Escape");

  const { client, context } = await guestBrowser(browser);
  await client.goto(link);
  await showComments(client);
  const guestCard = card(client, "Owner note");
  await expect(guestCard.getByTestId("reply-summary")).toContainText(/1 reply.*Ana, /);
  await expect(guestCard.locator("[data-card-select]")).toHaveAccessibleDescription(/1 reply/);
  // Replies never count as comments (D6): the reply is no second pin or card.
  await expect(client.getByRole("button", { name: /^Comment 2 by/ })).toHaveCount(0);

  // Selected, the card shows the thread and the reply box, and no reply menu (D2).
  await guestCard.locator("[data-card-select]").click();
  const replies = guestCard.getByTestId("reply");
  await expect(replies).toHaveCount(1);
  await expect(replies.first().getByTestId("reply-body")).toHaveText("On it.");
  await expect(replies.first()).toContainText("Ana");
  await expect(guestCard.getByTestId("reply-summary")).toHaveCount(0);
  await expect(guestCard.getByTestId("reply-composer")).toBeVisible();
  for (const absent of ["reply-more", "client-chip"]) {
    await expect(guestCard.getByTestId(absent)).toHaveCount(0);
  }

  // The pin's popover has the thread and a box too, and no reply menu either.
  await client.getByRole("button", { name: "Comment 1 by Ana", exact: true }).click();
  const popover = client.getByTestId("pin-popover");
  await expect(popover.getByTestId("reply")).toHaveCount(1);
  await expect(popover.getByTestId("reply-composer")).toBeVisible();
  await expect(popover.getByTestId("reply-more")).toHaveCount(0);

  // The team replies more while the guest reads, through the refresh. Once the popover's thread
  // scrolls, a reply arriving never moves it, though the popover has focus.
  if (!(await box.isVisible())) await ownerCard.locator("[data-card-select]").click();
  const teamReplies = async (words: string[]) => {
    const pushed = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.startsWith("/api/shares/") &&
        response.request().method() === "PATCH" &&
        (response.request().postData() ?? "").includes(words.at(-1) ?? ""),
    );
    for (const body of words) {
      await box.fill(body);
      await box.press("Enter");
    }
    expect((await pushed).status()).toBe(200);
    await client.evaluate(() => window.dispatchEvent(new Event("focus")));
  };
  const long = (index: number) => `Late note ${index}. ${"More. ".repeat(40).trim()}`;
  await teamReplies([1, 2, 3, 4].map(long));
  await expect(popover.getByTestId("reply")).toHaveCount(5);
  const scroller = popover.locator("[data-menu-bounds]");
  await expect
    .poll(() => scroller.evaluate((node) => node.scrollHeight > node.clientHeight + 100))
    .toBe(true);
  await scroller.evaluate((node) => node.scrollTo({ top: 0 }));
  await teamReplies(["Last note."]);
  await expect(popover.getByTestId("reply")).toHaveCount(6);
  // Long enough for a smooth scroll to have moved it.
  await client.waitForTimeout(800);
  expect(await scroller.evaluate((node) => node.scrollTop)).toBe(0);
  await context.close();
});

test("a guest replies on a review link, the team reads it and answers, and a resolve closes it", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One desktop browser is enough for this.");
  const postedTo = (target: Page, path: RegExp) =>
    target.waitForResponse(
      (response) =>
        path.test(new URL(response.url()).pathname) && response.request().method() === "POST",
    );
  await openFolder(page);
  await createImageProject(page, "round-trip.png");
  await postComment(page, "Owner note", { x: 100, y: 80 }, "Ana");
  await showComments(page);
  await page.getByTestId("share-button").click();
  const dialog = page.getByTestId("share-dialog");
  const link = (await dialog.getByTestId("copy-share-link").getAttribute("data-url"))!;
  await expect(dialog.getByTestId("share-sync")).toHaveAttribute("data-sync", "synced");
  await page.keyboard.press("Escape");

  // Guest: Reply opens the box, which asks for their name first, as nothing is remembered (D7).
  const { client, context } = await guestBrowser(browser);
  await client.goto(link);
  await showComments(client);
  const guestCard = card(client, "Owner note");
  await guestCard.locator("[data-card-select]").click();
  await guestCard.getByTestId("reply-start").click();
  const name = guestCard.getByRole("textbox", { name: "Your name" });
  await expect(name).toBeFocused();
  const words = guestCard.getByRole("textbox", { name: "Reply", exact: true });
  await words.fill("Looks great.");
  await words.press("Enter");
  await expect(
    guestCard.getByTestId("reply-composer").getByText("Add your name so others know who replied."),
  ).toBeVisible();
  await name.fill("Cleo");
  const sent = postedTo(client, /^\/api\/s\/[^/]+\/comments\/[^/]+\/replies$/);
  await words.press("Enter");
  expect((await sent).status()).toBe(201);
  await expect(guestCard.getByTestId("reply")).toHaveCount(1);
  await expect(guestCard.getByTestId("reply")).toContainText("Cleo");
  await expect(words).toHaveValue("");
  await expect(words).toBeFocused();

  // Team: the sync pulls the guest's reply, saves it as a client's, and the thread shows it.
  const ownerCard = card(page, "Owner note");
  const saved = postedTo(page, /^\/api\/w\/[^/]+\/projects\/[^/]+\/comments\/[^/]+\/replies$/);
  // Selected or not, the card names Cleo once the reply is in: in its thread, or its summary line.
  await pullUntil(page, ownerCard.filter({ hasText: "Cleo" }));
  expect((await saved).status()).toBe(201);
  const box = ownerCard.getByRole("textbox", { name: "Reply", exact: true });
  if (!(await box.isVisible())) await ownerCard.locator("[data-card-select]").click();
  const pulled = ownerCard.getByTestId("reply").filter({ hasText: "Looks great." });
  await expect(pulled).toContainText("Cleo");
  await expect(pulled.getByTestId("client-chip")).toHaveText("Client");

  // Team answers; the guest reads it after their own.
  const pushed = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.startsWith("/api/shares/") &&
      response.request().method() === "PATCH" &&
      (response.request().postData() ?? "").includes("Thanks, Cleo."),
  );
  await box.fill("Thanks, Cleo.");
  await box.press("Enter");
  expect((await pushed).status()).toBe(200);
  await expect(async () => {
    await client.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(guestCard.getByTestId("reply")).toHaveCount(2, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(guestCard.getByTestId("reply").last().getByTestId("reply-body")).toHaveText(
    "Thanks, Cleo.",
  );

  // Team resolves it: the guest's thread stays to read, with why there's no box (D4).
  const resolved = page.waitForResponse(
    (response) =>
      /\/api\/w\/[^/]+\/projects\/[^/]+\/comments\/[^/]+$/.test(response.url()) &&
      response.request().method() === "PATCH",
  );
  await ownerCard.getByRole("button", { name: "Resolve" }).click();
  expect((await resolved).status()).toBe(200);
  await client.reload();
  await showComments(client);
  await client.getByTestId("tab-resolved").click();
  const closedCard = card(client, "Owner note");
  await closedCard.locator("[data-card-select]").click();
  await expect(closedCard.getByTestId("reply")).toHaveCount(2);
  await expect(closedCard.getByTestId("reply-closed-note")).toHaveText(
    "The team resolved this, so it's closed for replies.",
  );
  await expect(closedCard.getByTestId("reply-composer")).toHaveCount(0);
  await context.close();
});

/** Drops a pin on the open link's image; the composer asks for a name, or says whose it posts as. */
async function composerOn(client: Page, position = { x: 140, y: 110 }): Promise<Locator> {
  await expect(client.getByRole("img", { name: /the image under review/ })).toBeVisible();
  return dropPin(client, position);
}

/** A guest's browser: signed out, with How it works already seen. */
async function guestBrowser(browser: Browser): Promise<{ client: Page; context: BrowserContext }> {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const client = await context.newPage();
  await skipReviewGuide(client);
  return { client, context };
}

test("a client is asked for a name once per link, and again on another link", async ({
  page,
  browser,
}) => {
  const first = await shareImageProject(page, "first.png");
  const second = await shareImageProject(page, "second.png");
  const { client, context } = await guestBrowser(browser);

  await client.goto(first);
  let composer = await composerOn(client);
  await expect(composer.getByLabel("Your name")).toBeVisible();
  await composer.getByLabel("Your name").fill("Cleo");
  await composer.getByLabel("Comment", { exact: true }).fill("First thoughts");
  await composer.getByLabel("Comment", { exact: true }).press("Enter");
  await expect(composer).toHaveCount(0);

  // Kept for this link only, for 90 days: a cookie its page can read, scoped to its path.
  const names = (await context.cookies()).filter(
    (cookie) => cookie.name === "squint_reviewer_name",
  );
  expect(names).toEqual([
    expect.objectContaining({
      value: "Cleo",
      path: new URL(first).pathname,
      httpOnly: false,
      sameSite: "Lax",
    }),
  ]);
  const days = ((names[0]?.expires ?? 0) * 1000 - Date.now()) / (24 * 60 * 60 * 1000);
  expect(days).toBeGreaterThan(89.9);
  expect(days).toBeLessThanOrEqual(90);
  expect(await client.evaluate(() => localStorage.getItem("squint:reviewer-name"))).toBeNull();

  // A reload keeps the name: the next pin posts as Cleo without asking.
  await client.reload();
  composer = await composerOn(client, { x: 200, y: 140 });
  await expect(composer).toContainText("Posting as Cleo");
  await expect(composer.getByLabel("Your name")).toHaveCount(0);
  await client.keyboard.press("Escape");
  await expect(composer).toHaveCount(0);

  // Another link asks again.
  await client.goto(second);
  composer = await composerOn(client);
  await expect(composer.getByLabel("Your name")).toHaveValue("");
  await context.close();

  // A name an earlier version kept for every link moves to the first link opened, once.
  const returning = await guestBrowser(browser);
  await returning.client.goto(second);
  await expect(returning.client.getByRole("img", { name: /the image under review/ })).toBeVisible();
  await returning.client.evaluate(() => localStorage.setItem("squint:reviewer-name", "Ana"));
  await returning.client.reload();
  composer = await composerOn(returning.client);
  await expect(composer).toContainText("Posting as Ana");
  expect(
    await returning.client.evaluate(() => localStorage.getItem("squint:reviewer-name")),
  ).toBeNull();
  await returning.client.keyboard.press("Escape");
  await returning.client.goto(first);
  composer = await composerOn(returning.client);
  await expect(composer.getByLabel("Your name")).toHaveValue("");
  await returning.context.close();
});

test("a client's first visit opens How it works once, and its button opens it again", async ({
  page,
  browser,
  baseURL,
}) => {
  const link = await sharedProject(page, baseURL, "Guided review");
  const clientContext = await browser.newContext({ storageState: SIGNED_OUT });
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
    "Send feedback within 3 days",
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
  const clientContext = await browser.newContext({ storageState: SIGNED_OUT });
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
