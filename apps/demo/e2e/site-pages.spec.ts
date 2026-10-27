import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createUrlProject,
  dropPin,
  hideComments,
  mockCapture,
  mockFrameCheck,
  openFolder,
  postComment,
  showComments,
  skipReviewGuide,
  topBarStatus,
} from "./squint-fixtures";

function addressField(page: Page): Locator {
  return page.getByTestId("page-address");
}

function card(page: Page, text: string): Locator {
  return page.getByTestId("comment-card").filter({ hasText: text });
}

function pin(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}

/** Types a page into the address bar and goes there. */
async function goToPage(page: Page, path: string): Promise<void> {
  await addressField(page).fill(path);
  await addressField(page).press("Enter");
  await expect(addressField(page)).toHaveValue(path);
}

/** A page in the address bar's menu, by its path (and its active comments). */
function pageItem(page: Page, path: string, active?: string): Locator {
  const count = active ? `\\s*, ${active}` : "(\\s*,.*)?";
  return page.getByRole("menuitemradio", { name: new RegExp(`^${path}${count}$`) });
}

/** Picks a reviewed page from the address bar's menu. */
async function pickPage(page: Page, path: string): Promise<void> {
  await page.getByTestId("page-menu").click();
  await pageItem(page, path).click();
  await expect(addressField(page)).toHaveValue(path);
}

/** The URL each capture asked for, in order. */
function captureUrls(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/capture")) {
      urls.push((request.postDataJSON() as { url: string }).url);
    }
  });
  return urls;
}

async function sandboxProject(
  page: Page,
  baseURL: string | undefined,
  name: string,
  address = `${baseURL}/sandbox`,
) {
  await mockFrameCheck(page, {
    verdict: "embeddable",
    finalUrl: `${baseURL}/sandbox`,
    status: 200,
  });
  await openFolder(page);
  await createUrlProject(page, address, name);
  await expect(addressField(page)).toHaveValue("/sandbox");
}

/** The sandbox's frame, once it's loaded. */
function siteFrame(page: Page) {
  const frame = page.frames().find((entry) => entry.url().includes("/sandbox"));
  if (!frame) throw new Error("the site's frame isn't there");
  return frame;
}

/** Waits until the viewer's window has heard a message, so a test can check it was ignored. */
function nextMessage(page: Page): Promise<unknown> {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        window.addEventListener("message", (event) => resolve(event.data), { once: true });
      }),
  );
}

function snapshotOf(page: Page, path: string): Locator {
  return page.getByRole("img", { name: new RegExp(`^Snapshot of [^,]+${path},`) });
}

test("a website is reviewed page by page, with counts per page and cards that switch pages", async ({
  page,
  baseURL,
}) => {
  const captures = await mockCapture(page);
  const asked = captureUrls(page);
  await sandboxProject(page, baseURL, "Two pages");

  // The project's own page first.
  await page.getByTestId("mode-comment").click();
  await expect(snapshotOf(page, "/sandbox")).toBeVisible();
  await postComment(page, "Home hero.", { x: 120, y: 90 }, "Ana");
  await expect(pin(page, "Comment 1 by Ana")).toBeVisible();

  // Another site is refused inline, and nothing is captured or framed.
  await addressField(page).fill("https://example.com/pricing");
  await addressField(page).press("Enter");
  await expect(page.getByTestId("page-address-bar").getByRole("alert")).toContainText(
    /Only pages on 127\.0\.0\.1:\d+ can be reviewed in this project/,
  );
  await expect(addressField(page)).toHaveAttribute("aria-invalid", "true");
  await addressField(page).press("Escape");
  await expect(addressField(page)).toHaveValue("/sandbox");
  await expect(page.getByTestId("page-address-bar").getByRole("alert")).toHaveCount(0);

  // A sub-page gets its own snapshot and comments.
  await goToPage(page, "/sandbox/about");
  await expect(snapshotOf(page, "/sandbox/about")).toBeVisible();
  expect(asked).toEqual([`${baseURL}/sandbox`, `${baseURL}/sandbox/about`]);
  await expect(pin(page, "Comment 1 by Ana")).toHaveCount(0);
  await showComments(page);
  await expect(page.getByTestId("comments-empty")).toContainText(
    "No comments on /sandbox/about (Desktop) yet",
  );
  await hideComments(page);
  await postComment(page, "About values.", { x: 160, y: 140 });
  await expect(pin(page, "Comment 2 by Ana")).toBeVisible();

  // Each page counts its own; the breakpoint and the project count them all.
  await page.getByTestId("page-menu").click();
  await expect(pageItem(page, "/sandbox", "1 active comment")).toBeVisible();
  await expect(pageItem(page, "/sandbox/about", "1 active comment")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("breakpoint-desktop")).toContainText("2");
  await expect(topBarStatus(page)).toContainText("Comments in");

  // Back to the first page: its snapshot comes back without a new capture.
  await pickPage(page, "/sandbox");
  await expect(snapshotOf(page, "/sandbox")).toBeVisible();
  await expect(pin(page, "Comment 1 by Ana")).toBeVisible();
  await expect(pin(page, "Comment 2 by Ana")).toHaveCount(0);
  expect(captures()).toBe(2);

  // All pages: each card says its page, and a card from another page goes there.
  await showComments(page);
  await expect(card(page, "About values.")).toHaveCount(0);
  await page.getByTestId("scope-all").click();
  await expect(card(page, "Home hero.").getByTestId("comment-page")).toHaveText("/sandbox");
  const about = card(page, "About values.");
  await expect(about.getByTestId("comment-page")).toHaveText("/sandbox/about");
  await about.getByRole("button", { name: /Comment 2 by Ana/ }).click();
  await expect(addressField(page)).toHaveValue("/sandbox/about");
  await hideComments(page);
  await expect(pin(page, "Comment 2 by Ana")).toBeVisible();

  // Browse shows the same page live.
  await page.getByTestId("mode-browse").click();
  await expect(page.getByTestId("preview-frame")).toHaveAttribute(
    "src",
    `${baseURL}/sandbox/about`,
  );
  expect(captures()).toBe(2);
});

test("the framed site's own navigation moves the address bar, from its own frame and origin only", async ({
  page,
  baseURL,
}) => {
  await mockCapture(page);
  const asked = captureUrls(page);
  // A page on another origin that claims to be on the project's site.
  await page.route("http://evil.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><title>Elsewhere</title><p>Elsewhere</p><script>
        parent.postMessage({ type: "squint:location", href: "${baseURL}/sandbox/evil" }, "*");
      </script>`,
    }),
  );
  await sandboxProject(page, baseURL, "Follow the site");
  const site = page.frameLocator('[data-testid="preview-frame"]');

  // Following a link inside the site (a client-side navigation) is followed here.
  await site.getByRole("link", { name: "About" }).click();
  await expect(addressField(page)).toHaveValue("/sandbox/about");
  await expect(page.getByTestId("page-address-bar")).toContainText("Reviewing /sandbox/about");
  // The frame isn't reloaded for it: it's already there.
  await expect(page.getByTestId("preview-frame")).toHaveAttribute("src", `${baseURL}/sandbox`);
  await page.getByTestId("mode-comment").click();
  await expect(snapshotOf(page, "/sandbox/about")).toBeVisible();
  expect(asked).toEqual([`${baseURL}/sandbox/about`]);
  await page.getByTestId("mode-browse").click();

  // The viewer's own window posting the same message is ignored.
  const heard = await page.evaluate(
    (href) =>
      new Promise<boolean>((resolve) => {
        window.addEventListener("message", () => resolve(true), { once: true });
        window.postMessage({ type: "squint:location", href }, "*");
      }),
    `${baseURL}/sandbox/evil`,
  );
  expect(heard).toBe(true);
  await expect(addressField(page)).toHaveValue("/sandbox/about");

  // So is the review's frame once it's on another origin.
  const received = page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        window.addEventListener("message", (event) => resolve(event.origin), { once: true });
      }),
  );
  await siteFrame(page).goto("http://evil.test/");
  expect(await received).toBe("http://evil.test");
  await expect(addressField(page)).toHaveValue("/sandbox/about");
});

test("a client reviews each page the owner reviewed, and captures others on the same site only", async ({
  page,
  browser,
  baseURL,
}) => {
  await mockCapture(page);
  await sandboxProject(page, baseURL, "Shared pages");
  await page.getByTestId("mode-comment").click();
  await expect(snapshotOf(page, "/sandbox")).toBeVisible();
  await postComment(page, "Owner home note.", { x: 120, y: 90 }, "Ana");
  await goToPage(page, "/sandbox/about");
  await expect(snapshotOf(page, "/sandbox/about")).toBeVisible();
  await postComment(page, "Owner about note.", { x: 160, y: 140 });

  await page.getByTestId("share-button").click();
  const dialog = page.getByTestId("share-dialog");
  await dialog.getByTestId("create-share-link").click();
  const urlField = dialog.getByTestId("share-url");
  await expect(urlField).toHaveValue(/\/s\/[A-Za-z0-9_-]{43}$/);
  await expect(dialog.getByTestId("sync-status")).toContainText("Synced");
  const link = await urlField.inputValue();
  await page.keyboard.press("Escape");

  const clientContext = await browser.newContext();
  const client = await clientContext.newPage();
  await skipReviewGuide(client);
  await mockFrameCheck(client, {
    verdict: "embeddable",
    finalUrl: `${baseURL}/sandbox`,
    status: 200,
  });
  await client.goto(link);
  await expect(addressField(client)).toHaveValue("/sandbox");
  await client.getByTestId("mode-comment").click();
  await expect(pin(client, "Comment 1 by Ana")).toBeVisible();

  // The owner's other page is there, with its snapshot and comment.
  await client.getByTestId("page-menu").click();
  await expect(pageItem(client, "/sandbox/about", "1 active comment")).toBeVisible();
  await client.keyboard.press("Escape");
  await pickPage(client, "/sandbox/about");
  await expect(pin(client, "Comment 2 by Ana")).toBeVisible();
  await expect(pin(client, "Comment 1 by Ana")).toHaveCount(0);
  const sent = client.waitForResponse(
    (response) => response.url().includes("/comments") && response.request().method() === "POST",
  );
  await postComment(client, "Client about note.", { x: 260, y: 220 }, "Cleo");
  expect((await sent).status()).toBe(201);

  // A page nobody has reviewed is captured through the share, on the same site only.
  await client.route("**/api/s/*/capture", (route) =>
    route.fulfill({ status: 503, json: { error: "unavailable" } }),
  );
  const capture = client.waitForRequest("**/api/s/*/capture");
  await goToPage(client, "/sandbox/team");
  expect((await capture).postDataJSON()).toMatchObject({ url: `${baseURL}/sandbox/team` });
  await expect(client.getByTestId("capture-failed")).toBeVisible();
  await addressField(client).fill("https://example.com/");
  await addressField(client).press("Enter");
  await expect(client.getByTestId("page-address-bar").getByRole("alert")).toBeVisible();

  // The owner gets the client's comment on the page it was left on.
  await showComments(page);
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(card(page, "Client about note.")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(card(page, "Client about note.").getByTestId("comment-page")).toHaveText(
    "/sandbox/about",
  );
  await pickPage(page, "/sandbox");
  await expect(card(page, "Client about note.")).toHaveCount(0);
  await clientContext.close();
});

test("a project's own address keeps its fragment when framed and captured", async ({
  page,
  baseURL,
}) => {
  await mockCapture(page);
  const asked = captureUrls(page);
  const own = `${baseURL}/sandbox#/checkout`;
  await sandboxProject(page, baseURL, "Hash route", own);
  const frame = page.getByTestId("preview-frame");
  await expect(frame).toHaveAttribute("src", own);

  await page.getByTestId("mode-comment").click();
  await expect(snapshotOf(page, "/sandbox")).toBeVisible();
  await goToPage(page, "/sandbox/about");
  await expect(snapshotOf(page, "/sandbox/about")).toBeVisible();
  // Back on the project's own page: its snapshot, and the frame at its exact address.
  await pickPage(page, "/sandbox");
  await expect(snapshotOf(page, "/sandbox")).toBeVisible();
  await page.getByTestId("mode-browse").click();
  await expect(frame).toHaveAttribute("src", own);
  expect(asked).toEqual([own, `${baseURL}/sandbox/about`]);
});

test("Comment mode doesn't follow the hidden frame, and Browse doesn't replay what it missed", async ({
  page,
  baseURL,
}) => {
  const captures = await mockCapture(page);
  await sandboxProject(page, baseURL, "Stay put");
  await expect(page.getByTestId("preview-frame")).toBeVisible();
  const site = siteFrame(page);

  // The hidden site rewrites its own address while a draft pin is open.
  await page.getByTestId("mode-comment").click();
  await expect(snapshotOf(page, "/sandbox")).toBeVisible();
  const draft = await dropPin(page);
  await draft.getByLabel("Comment", { exact: true }).fill("Half a thought");
  const heard = nextMessage(page);
  await site.evaluate(() => history.replaceState(null, "", "/sandbox?lang=fr"));
  expect(await heard).toMatchObject({ href: `${baseURL}/sandbox?lang=fr` });
  await expect(addressField(page)).toHaveValue("/sandbox");
  await expect(draft.getByLabel("Comment", { exact: true })).toHaveValue("Half a thought");
  expect(captures()).toBe(1);
  await draft.getByRole("button", { name: "Cancel" }).click();

  // Back in Browse, what was missed isn't replayed; the site's next navigation is followed.
  await page.getByTestId("mode-browse").click();
  await expect(addressField(page)).toHaveValue("/sandbox");
  await site.evaluate(() => history.pushState(null, "", "/sandbox/about"));
  await expect(addressField(page)).toHaveValue("/sandbox/about");
  expect(captures()).toBe(1);
});
