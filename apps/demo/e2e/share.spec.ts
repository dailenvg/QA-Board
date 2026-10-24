import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createUrlProject,
  mockCapture,
  mockFrameCheck,
  OVERVIEW_HEADLINE,
  openFolder,
  postComment,
  showComments,
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
  const link = await urlField.inputValue();
  await expect(dialog.getByTestId("sync-status")).toContainText("Synced");
  await page.keyboard.press("Escape");

  // Client: a separate browser (its own storage) opens the link.
  const clientContext = await browser.newContext();
  const client = await clientContext.newPage();
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

  await showComments(client);
  const ownerNote = card(client, "Owner note");
  await expect(ownerNote).toBeVisible();
  await expect(ownerNote.getByTestId("comment-crop").locator("img")).toBeVisible();
  // Clients read and add; they don't moderate.
  await expect(ownerNote.getByRole("button", { name: /Resolve|Reopen/ })).toHaveCount(0);
  await expect(ownerNote.getByRole("button", { name: /Edit comment|Delete comment/ })).toHaveCount(
    0,
  );

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
      /\/api\/shares\/[^/]+$/.test(response.url()) && response.request().method() === "PUT",
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

  // Owner revokes; the link is gone.
  await page.getByTestId("share-button").click();
  await dialog.getByRole("button", { name: "Revoke link" }).click();
  await page
    .getByRole("dialog", { name: "Revoke this link?" })
    .getByRole("button", { name: "Revoke link" })
    .click();
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
  await expect(confirm).toContainText("client link will stop working");
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
          (JSON.parse(localStorage.getItem("squint:v2") ?? "{}") as { revocations: unknown[] })
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
  await mockFrameCheck(client, {
    verdict: "embeddable",
    finalUrl: `${baseURL}/sandbox`,
    status: 200,
  });
  await client.goto(link);
  await client.getByTestId("mode-comment").click();
  await expect(client.getByRole("img", { name: /^Snapshot of/ })).toBeVisible();

  await client.route("**/api/s/*/comments", (route) =>
    route.fulfill({ status: 503, json: { error: "unavailable" } }),
  );
  await client.getByTestId("comment-overlay").click({ position: { x: 160, y: 140 } });
  const composer = client.getByTestId("composer");
  await composer.getByLabel("Your name").fill("Cleo");
  await composer.getByLabel("Comment", { exact: true }).fill("Keep this text");
  await composer.getByRole("button", { name: "Post" }).click();

  await expect(composer.getByTestId("composer-send-error")).toContainText("wasn't sent");
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
  await clientContext.close();
});
