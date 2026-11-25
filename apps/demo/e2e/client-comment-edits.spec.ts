import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./test";
import { SIGNED_OUT } from "./auth-fixtures";
import {
  dropPin,
  hideComments,
  postComment,
  shareImageProject,
  showComments,
  skipReviewGuide,
} from "./squint-fixtures";

/**
 * A client edits the words of a comment they posted, from the browser that
 * posted it, until the team resolves it (4.12, 4b.16).
 */

function card(page: Page, text: string): Locator {
  return page.getByTestId("comment-card").filter({ hasText: text });
}

/**
 * The same card by its comment's id: an open editor takes the words out of the card's text,
 * so a locator by text stops matching mid-edit.
 */
async function byId(page: Page, found: Locator): Promise<Locator> {
  await expect(found).toBeVisible();
  const id = await found.getAttribute("data-comment-id");
  return page.locator(`[data-testid="comment-card"][data-comment-id="${id}"]`);
}

/** The owner's viewer pulls client comments and edits on focus (and every 15 seconds). */
async function pullUntil(page: Page, check: Locator): Promise<void> {
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(check).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/** A guest's browser: signed out, with How it works already seen; a phone's at 375 px. */
async function guestBrowser(
  browser: Browser,
  phone = false,
): Promise<{ client: Page; context: BrowserContext }> {
  const context = await browser.newContext({
    storageState: SIGNED_OUT,
    ...(phone ? { viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true } : {}),
  });
  const client = await context.newPage();
  await skipReviewGuide(client);
  return { client, context };
}

/** The guest opens `link` and posts `body` as Cleo; their comment's card, in the list. */
async function clientPosts(client: Page, link: string, body: string): Promise<Locator> {
  await client.goto(link);
  await expect(client.getByRole("img", { name: /the image under review/ })).toBeVisible();
  const sent = client.waitForResponse(
    (response) => response.url().endsWith("/comments") && response.request().method() === "POST",
  );
  await postComment(client, body, { x: 160, y: 120 }, "Cleo");
  expect((await sent).status()).toBe(201);
  await showComments(client);
  return byId(client, card(client, body));
}

/** Opens the card's editor and types `words` over the comment. */
async function startEdit(own: Locator, words: string): Promise<Locator> {
  await own.getByRole("button", { name: /^Edit comment \d+$/ }).click();
  const field = own.getByRole("textbox", { name: "Edit comment" });
  await expect(field).toBeFocused();
  await field.fill(words);
  return field;
}

/**
 * Waits until nothing from `locator` up is moved by a transform: opening the editor slides the
 * card into its new place (its `layout` animation) and swaps the editor in from the side.
 * Boxes read before then are mid-slide, and each read lands on a different frame.
 */
async function inPlace(locator: Locator): Promise<void> {
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        for (let node: Element | null = element; node; node = node.parentElement) {
          if (getComputedStyle(node).transform !== "none") return false;
        }
        return true;
      }),
    )
    .toBe(true);
}

/** The owner resolves the client's comment in the workspace; answers once the server has it. */
async function ownerResolves(page: Page, text: string): Promise<void> {
  const saved = page.waitForResponse(
    (response) =>
      /\/api\/w\/[^/]+\/projects\/[^/]+\/comments\/[^/]+$/.test(response.url()) &&
      response.request().method() === "PATCH",
  );
  await card(page, text).getByRole("button", { name: "Resolve" }).click();
  expect((await saved).status()).toBe(200);
}

test("a client edits from the browser that posted, the team sees Edited, and a resolve locks it", async ({
  page,
  browser,
}) => {
  const link = await shareImageProject(page, "edits.png");
  const { client, context } = await guestBrowser(browser);
  const own = await clientPosts(client, link, "Logo is small");

  // Edit, then Save: the new words show with when.
  await startEdit(own, "Logo is too small");
  const patched = client.waitForResponse(
    (response) =>
      /\/comments\/[^/]+$/.test(response.url()) && response.request().method() === "PATCH",
  );
  await own.getByRole("button", { name: "Save" }).click();
  expect((await patched).status()).toBe(200);
  const edited = own;
  await expect(edited).toContainText("Logo is too small");
  await expect(edited.getByTestId("comment-edited")).toHaveText("Edited just now");
  await expect(client.getByTestId("toast").filter({ hasText: "Comment updated." })).toBeVisible();
  // Focus goes back to Edit.
  await expect(edited.getByRole("button", { name: /^Edit comment \d+$/ })).toBeFocused();

  // Another browser sees the new words, but can't edit them.
  const other = await guestBrowser(browser);
  await other.client.goto(link);
  await showComments(other.client);
  const seen = card(other.client, "Logo is too small");
  await expect(seen.getByTestId("comment-edited")).toBeVisible();
  await expect(seen.getByRole("button", { name: /Edit comment/ })).toHaveCount(0);
  await other.context.close();

  // The team sees the edit after the pull, marked edited, still a client's.
  await showComments(page);
  const inWorkspace = card(page, "Logo is too small");
  await pullUntil(page, inWorkspace.getByTestId("comment-edited"));
  await expect(inWorkspace.getByTestId("client-chip")).toHaveText("Client");
  await expect(inWorkspace.getByRole("button", { name: /Edit comment/ })).toHaveCount(0);

  // The client starts another edit; the team resolves meanwhile.
  const field = await startEdit(edited, "Logo is far too small");
  await ownerResolves(page, "Logo is too small");

  // Saving is refused, and the typed words stay to copy; only Close is left, and has focus.
  await edited.getByRole("button", { name: "Save" }).click();
  await expect(edited.getByTestId("comment-edit-alert")).toContainText(
    "The team resolved this comment while you were editing, so it can't be edited now. Your text is still here to copy.",
  );
  await expect(field).toHaveValue("Logo is far too small");
  await expect(edited.getByRole("button", { name: "Save" })).toHaveCount(0);
  await expect(edited.getByRole("button", { name: "Close" })).toBeFocused();

  // Closing shows it resolved, saying why it can't be edited, with the words it had.
  await edited.getByRole("button", { name: "Close" }).click();
  await client.getByTestId("tab-resolved").click();
  const resolved = card(client, "Logo is too small");
  await expect(resolved.getByTestId("comment-resolved-note")).toHaveText(
    "The team resolved this, so it can't be edited or replied to.",
  );
  await expect(resolved.getByRole("button", { name: /Edit comment/ })).toHaveCount(0);
  await expect(card(client, "far too small")).toHaveCount(0);
  await context.close();
});

test("the editor saves with Ctrl or Cmd+Enter, cancels with Escape, and won't save empty words", async ({
  page,
  browser,
}) => {
  const link = await shareImageProject(page, "keys.png");
  const { client, context } = await guestBrowser(browser);
  const own = await clientPosts(client, link, "Button is grey");

  // Escape discards without asking, and sends nothing.
  let patches = 0;
  client.on("request", (request) => {
    if (request.method() === "PATCH") patches += 1;
  });
  const field = await startEdit(own, "Never sent");
  await field.press("Escape");
  await expect(card(client, "Button is grey")).toBeVisible();
  expect(patches).toBe(0);

  // Empty words: the client's own message, nothing sent.
  const empty = await startEdit(own, "   ");
  await empty.press("ControlOrMeta+Enter");
  await expect(own).toContainText(
    "A comment can't be empty. Type something, or cancel to keep the old text.",
  );
  expect(patches).toBe(0);

  // Ctrl or Cmd+Enter saves.
  await empty.fill("Button is blue now");
  await empty.press("ControlOrMeta+Enter");
  await expect(card(client, "Button is blue now").getByTestId("comment-edited")).toBeVisible();
  expect(patches).toBe(1);
  await context.close();
});

test("on a 375 px phone, the editor fits the sheet and saves", async ({ page, browser }) => {
  const link = await shareImageProject(page, "phone.png");
  const { client, context } = await guestBrowser(browser, true);
  await client.goto(link);
  await expect(client.getByRole("img", { name: /the image under review/ })).toBeVisible();
  await hideComments(client);
  const composer = await dropPin(client, { x: 120, y: 100 });
  await composer.getByLabel("Your name").fill("Cleo");
  await composer.getByLabel("Comment", { exact: true }).fill("Menu overlaps");
  await composer.getByLabel("Comment", { exact: true }).press("Enter");
  await expect(composer).toHaveCount(0);
  await showComments(client);

  const own = await byId(client, card(client, "Menu overlaps"));
  await startEdit(own, "Menu overlaps the logo");
  await inPlace(own.locator("form"));
  const save = own.getByRole("button", { name: "Save" });
  const cancel = own.getByRole("button", { name: "Cancel" });
  for (const button of [save, cancel]) {
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  // Side by side, right-aligned, and nothing wider than the screen.
  const [saveBox, cancelBox] = [await save.boundingBox(), await cancel.boundingBox()];
  expect(Math.abs((saveBox?.y ?? 0) - (cancelBox?.y ?? 1))).toBeLessThan(2);
  expect((cancelBox?.x ?? 0) < (saveBox?.x ?? 0)).toBe(true);
  const overflow = await client.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await save.click();
  await expect(card(client, "Menu overlaps the logo").getByTestId("comment-edited")).toBeVisible();
  await context.close();
});
