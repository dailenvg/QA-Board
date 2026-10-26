import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  newProjectButton,
  openFolder,
  pickImages,
  postComment,
  samplePngFiles,
  showComments,
} from "./squint-fixtures";

test("several images become one project each, named after their files", async ({ page }) => {
  await openFolder(page);
  const dialog = await pickImages(page, await samplePngFiles(page, ["One", "Two", "Three"]));
  await expect(dialog.getByRole("radio", { name: /One project per file/ })).toBeChecked();
  await expect(dialog.getByText("Each project is named after its file.")).toBeVisible();

  await dialog.getByRole("button", { name: "Remove three.png" }).click();
  await expect(dialog.getByTestId("picked-image")).toHaveCount(2);
  await dialog.getByTestId("create-project").click();

  await expect(page.getByTestId("toast")).toContainText("Added 2 projects to My projects");
  const cards = page.getByTestId("project-card");
  await expect(cards.filter({ hasText: "one" })).toHaveCount(1);
  await expect(cards.filter({ hasText: "two" })).toHaveCount(1);
  await expect(cards.filter({ hasText: "three" })).toHaveCount(0);
});

test("an image that can't be prepared says why, and must be removed before creating", async ({
  page,
}) => {
  await openFolder(page);
  const [good] = await samplePngFiles(page, ["Good"]);
  if (!good) throw new Error("no image");
  await newProjectButton(page).click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await dialog.getByRole("radio", { name: "Image" }).click();
  await dialog
    .locator('input[type="file"]')
    .setInputFiles([
      good,
      { name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not an image") },
    ]);
  const broken = dialog.locator('[data-testid="picked-image"][data-status="failed"]');
  await expect(broken).toContainText("That image couldn't be read. Try another file.");
  await dialog.getByTestId("create-project").click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Remove the images that couldn't be prepared",
  );
  await dialog.getByRole("button", { name: "Remove broken.png" }).click();
  await dialog.getByTestId("create-project").click();
  await expect(page.getByRole("img", { name: /the image under review/ })).toBeVisible();
});

test("combined images become pages: reorder, comment on page 2, switch pages, deep link, export", async ({
  page,
}) => {
  await openFolder(page);
  // "One" (page 2 once reordered) is tall, so it scrolls on every screen.
  const files = await samplePngFiles(page, ["One", "Two", "Three"], { One: 3600 });
  const dialog = await pickImages(page, files);
  await dialog.getByTestId("grouping-combine").click();

  // Keyboard reorder: three.png moves to the front, and the move is announced.
  const handle = dialog.getByRole("button", { name: /^Reorder three\.png/ });
  await handle.focus();
  await handle.press("ArrowUp");
  await handle.press("ArrowUp");
  await expect(dialog.getByRole("status")).toHaveText("three.png moved to page 1 of 3.");
  await expect(dialog.getByTestId("picked-image")).toHaveText([
    /three\.png\s*Page 1/,
    /one\.png\s*Page 2/,
    /two\.png\s*Page 3/,
  ]);
  await dialog.getByTestId("create-project").click();

  const position = page.getByTestId("page-position");
  await expect(position).toHaveText("Page 1 of 3");
  await expect(
    page.getByRole("img", { name: /page 1 of 3, the image under review/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(position).toHaveText("Page 2 of 3");
  await expect(page).toHaveURL(/[?&]page=2$/);
  await postComment(page, "Fix the second page.", { x: 120, y: 90 }, "Ana");
  await expect(page.locator('[data-testid="page-thumb"][data-page="2"]')).toContainText("1");
  await expect(
    // Each part is its own (flex) span, so Chrome puts a space before each comma.
    page.getByRole("button", { name: /^Page 2 ?, 1 open comment ?, one\.png$/ }),
  ).toHaveAttribute("aria-current", "page");
  // The strip passes axe with a page's open-comment count showing (its names hold what shows).
  const strip = await new AxeBuilder({ page }).include('[data-testid="page-strip"]').analyze();
  expect(strip.violations.map(({ id, nodes }) => ({ id, nodes: nodes.length }))).toEqual([]);

  // Keyboard paging, not while typing: [ and ] switch pages.
  await page.keyboard.press("]");
  await expect(position).toHaveText("Page 3 of 3");
  await page.keyboard.press("[");
  await expect(position).toHaveText("Page 2 of 3");

  // PageDown reads on like a PDF reader: a screen further down, and only at the end of the
  // page, the next page. PageUp on a page that's at its top goes back a page.
  const canvas = page.getByTestId("canvas-area");
  const scroll = () => canvas.evaluate((element) => element.scrollTop);
  await expect
    .poll(() => canvas.evaluate((element) => element.scrollHeight > element.clientHeight * 2))
    .toBe(true);
  await expect.poll(scroll).toBe(0);
  await page.keyboard.press("PageDown");
  await expect.poll(scroll).toBeGreaterThan(0);
  await expect(position).toHaveText("Page 2 of 3");
  await canvas.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await page.keyboard.press("PageDown");
  await expect(position).toHaveText("Page 3 of 3");
  await page.keyboard.press("PageUp");
  await expect(position).toHaveText("Page 2 of 3");
  await page.keyboard.press("]");
  await expect(position).toHaveText("Page 3 of 3");
  await expect(page.getByRole("button", { name: "Comment 1 by Ana", exact: true })).toHaveCount(0);

  // The panel: every page by default, each card saying its page; or just this page.
  await showComments(page);
  const card = page.getByTestId("comment-card");
  await expect(card.getByTestId("comment-page")).toHaveText("Page 2");
  await page.getByTestId("scope-page").click();
  await expect(page.getByTestId("comments-empty")).toContainText("No comments on page 3 yet");
  await expect(page.getByText("0 comments on page 3", { exact: true })).toBeAttached();
  await page.getByTestId("scope-all").click();
  await card.getByRole("button", { name: /Comment 1 by Ana/ }).click();
  await expect(position).toHaveText("Page 2 of 3");
  await expect(page.getByRole("button", { name: "Comment 1 by Ana", exact: true })).toBeVisible();

  // A deep link opens its page.
  await page.goto(page.url().replace(/page=\d+/, "page=3"));
  await expect(position).toHaveText("Page 3 of 3");

  // The export says which page each comment is on.
  await page.getByTestId("export-menu").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "JSON", exact: true }).click(),
  ]);
  const json = JSON.parse(await readFile(await download.path(), "utf8")) as {
    project: { source: { pages: Array<{ number: number; name: string }> } };
    comments: Array<{ location: { surface: string; page: { number: number; name: string } } }>;
  };
  expect(json.project.source.pages.map((entry) => entry.name)).toEqual([
    "three.png",
    "one.png",
    "two.png",
  ]);
  expect(json.comments[0]?.location).toMatchObject({
    surface: "page",
    page: { number: 2, name: "one.png" },
  });
});

test("a shared link opens the page it names, and a client's comment comes back on that page", async ({
  page,
  browser,
}) => {
  await openFolder(page);
  const dialog = await pickImages(page, await samplePngFiles(page, ["Home", "About"]));
  await dialog.getByTestId("grouping-combine").click();
  await dialog.getByTestId("create-project").click();
  await expect(page.getByTestId("page-position")).toHaveText("Page 1 of 2");

  await page.getByTestId("share-button").click();
  const share = page.getByTestId("share-dialog");
  await share.getByTestId("create-share-link").click();
  const link = await share.getByTestId("share-url").inputValue();
  await expect(share.getByTestId("sync-status")).toContainText("Synced");
  await page.keyboard.press("Escape");

  const clientContext = await browser.newContext();
  const client = await clientContext.newPage();
  await client.goto(`${link}?page=2`);
  await expect(client.getByTestId("page-position")).toHaveText("Page 2 of 2");
  await expect(
    client.getByRole("img", { name: /page 2 of 2, the image under review/ }),
  ).toBeVisible();
  await postComment(client, "About page note", { x: 140, y: 100 }, "Cleo");
  await expect(client.locator('[data-testid="page-thumb"][data-page="2"]')).toContainText("1");

  await showComments(page);
  const card = page.getByTestId("comment-card").filter({ hasText: "About page note" });
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(card).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(card.getByTestId("comment-page")).toHaveText("Page 2");
  await clientContext.close();
});
