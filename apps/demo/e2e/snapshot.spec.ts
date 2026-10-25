import { expect, test, type Page } from "@playwright/test";
import { LEGACY_V1 } from "../test/legacy-v1";
import { snapshotPng } from "./sample-snapshot";
import {
  createImageProject,
  createUrlProject,
  hideComments,
  mockCapture,
  mockFrameCheck,
  onlyCommentCard,
  openFolder,
  postComment,
  samplePng,
  showComments,
} from "./squint-fixtures";

async function sandboxProject(page: Page, baseURL: string | undefined, name: string) {
  await mockFrameCheck(page, {
    verdict: "embeddable",
    finalUrl: `${baseURL}/sandbox`,
    status: 200,
  });
  await openFolder(page);
  await createUrlProject(page, `${baseURL}/sandbox`, name);
}

function snapshotImage(page: Page) {
  return page.getByRole("img", { name: /^Snapshot of/ });
}

/**
 * Where a pin points, in page px. Pins scale from their tip when selected or
 * hovered, so the tip doesn't move while that spring runs; the top edge does.
 */
async function pinTip(page: Page, name: string): Promise<number> {
  const box = await page.getByRole("button", { name, exact: true }).boundingBox();
  if (!box) throw new Error(`${name} isn't on screen`);
  return box.y + box.height;
}

test("a website comment pins to a snapshot, scrolls with it and keeps a screenshot", async ({
  page,
  baseURL,
}) => {
  const captures = await mockCapture(page, { delayMs: 400 });
  await sandboxProject(page, baseURL, "Snapshot review");
  await expect(page.getByTestId("preview-frame")).toBeVisible();

  await page.getByTestId("mode-comment").click();
  await expect(page.getByTestId("capture-progress")).toContainText("Taking a snapshot");
  await expect(snapshotImage(page)).toBeVisible();
  await expect(page.getByTestId("snapshot-bar")).toContainText("Snapshot");
  await expect(page.getByTestId("comment-overlay")).toBeFocused();

  await postComment(page, "Move the CTA up.", { x: 120, y: 90 }, "Ana");
  const pinName = "Comment 1 by Ana";
  await expect(page.getByRole("button", { name: pinName, exact: true })).toBeVisible();

  // The pin rides along with the snapshot as the canvas scrolls. On a phone the desktop
  // snapshot is scaled to fit, so the canvas may scroll less than asked.
  const area = page.getByTestId("canvas-area");
  const before = await pinTip(page, pinName);
  const scrolled = await area.evaluate((node) => {
    node.scrollBy({ top: 300, behavior: "instant" });
    return node.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(50);
  await expect.poll(async () => before - (await pinTip(page, pinName))).toBeCloseTo(scrolled, 0);
  await area.evaluate((node) => node.scrollTo({ top: 0, behavior: "instant" }));

  await showComments(page);
  const crop = onlyCommentCard(page).getByTestId("comment-crop");
  await expect(crop.locator("img")).toBeVisible();
  await crop.click();
  const dialog = page.getByTestId("crop-dialog");
  await expect(dialog.getByRole("img", { name: "The area around pin 1" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // Browse shows the live site; snapshot pins aren't drawn over it.
  await page.getByTestId("mode-browse").click();
  await expect(page.getByTestId("preview-frame")).toBeVisible();
  await expect(page.getByTestId("pin")).toHaveCount(0);

  // The snapshot and crop come back from this browser's storage, without a new capture.
  await page.reload();
  await page.getByTestId("mode-comment").click();
  await expect(snapshotImage(page)).toBeVisible();
  await expect(page.getByRole("button", { name: pinName, exact: true })).toBeVisible();
  await showComments(page);
  await expect(onlyCommentCard(page).getByTestId("comment-crop").locator("img")).toBeVisible();
  expect(captures()).toBe(1);
});

test("each breakpoint keeps its own snapshot and comments, and a pin opens its comment", async ({
  page,
  baseURL,
}) => {
  const captures = await mockCapture(page);
  await sandboxProject(page, baseURL, "Breakpoint review");
  const captureWidth = async (action: () => Promise<void>) => {
    const request = page.waitForRequest("**/api/capture");
    await action();
    return ((await request).postDataJSON() as { width: number }).width;
  };

  // Desktop is the default, captured at its fixed width whatever the window's size.
  expect(await captureWidth(() => page.getByTestId("mode-comment").click())).toBe(1440);
  await expect(snapshotImage(page)).toBeVisible();
  await postComment(page, "Desktop hero.", { x: 120, y: 90 }, "Ana");
  const pin = page.getByRole("button", { name: "Comment 1 by Ana", exact: true });
  await expect(page.getByTestId("breakpoint-desktop")).toContainText("1");

  // The pin opens its comment beside it; Escape closes it and hands focus back to the pin.
  await pin.click();
  const popover = page.getByRole("dialog", { name: "Comment 1 by Ana" });
  await expect(popover).toContainText("Desktop hero.");
  await expect(pin).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
  await expect(pin).toBeFocused();
  await expect(page.getByTestId("canvas-area")).toHaveAttribute("data-mode", "comment");

  // Mobile gets its own capture, and none of Desktop's pins or comments.
  expect(await captureWidth(() => page.getByTestId("breakpoint-mobile").click())).toBe(390);
  await expect(snapshotImage(page)).toBeVisible();
  await expect(pin).toHaveCount(0);
  await showComments(page);
  await expect(page.getByTestId("comments-empty")).toBeVisible();
  await hideComments(page);

  // Browse frames the live site at the breakpoint's width.
  await page.getByTestId("mode-browse").click();
  await expect(page.getByTestId("canvas")).toHaveAttribute("data-frame-width", "390");

  // Back on Desktop, its snapshot and pin are still there, without another capture.
  await page.getByTestId("breakpoint-desktop").click();
  await page.getByTestId("mode-comment").click();
  await expect(pin).toBeVisible();
  expect(captures()).toBe(2);

  // The project's card shows the desktop snapshot instead of the favicon card.
  await openFolder(page);
  const card = page.getByTestId("project-card").filter({ hasText: "Breakpoint review" });
  await expect(card.locator('img[src^="blob:"]')).toBeVisible();
});

test("refreshing the snapshot keeps earlier comments on their own snapshot", async ({
  page,
  baseURL,
}) => {
  const captures = await mockCapture(page);
  await sandboxProject(page, baseURL, "Refresh review");
  await page.getByTestId("mode-comment").click();
  await expect(snapshotImage(page)).toBeVisible();
  await postComment(page, "Old hero.", { x: 140, y: 120 }, "Ana");
  const pin = page.getByRole("button", { name: "Comment 1 by Ana", exact: true });
  await expect(pin).toBeVisible();

  await page.getByRole("button", { name: "Refresh snapshot" }).click();
  await expect.poll(captures).toBe(2);
  await expect(pin).toHaveCount(0);
  await showComments(page);
  const card = onlyCommentCard(page);
  const chip = card.getByTestId("placement-chip");
  await expect(chip).toHaveAttribute("data-placement", "earlier");
  // The explanation is a tap away (no hover title), for touch too.
  await chip.click();
  await expect(chip).toHaveAttribute("aria-expanded", "true");
  await expect(card.getByTestId("placement-hint")).toBeVisible();

  await card.getByRole("button", { name: /Comment 1 by Ana/ }).click();
  const bar = page.getByTestId("snapshot-bar");
  await expect(bar).toContainText("Earlier snapshot");
  await expect(pin).toBeVisible();
  await bar.getByRole("button", { name: "Back to latest" }).click();
  await expect(bar).not.toContainText("Earlier snapshot");
  await expect(pin).toHaveCount(0);
});

test("a failed snapshot offers Retry and a screenshot upload", async ({ page, baseURL }) => {
  await mockCapture(page, { failWith: "unreachable" });
  await sandboxProject(page, baseURL, "Flaky site");
  await page.getByTestId("mode-comment").click();
  const failed = page.getByTestId("capture-failed");
  await expect(failed).toContainText("We couldn't reach the site");

  await mockCapture(page);
  await failed.getByRole("button", { name: "Retry" }).click();
  await expect(snapshotImage(page)).toBeVisible();
  await expect(failed).toHaveCount(0);

  // A site that refuses framing can still be captured; here the capture is refused too.
  await mockFrameCheck(page, {
    verdict: "blocked",
    reason: "csp",
    finalUrl: "https://internal.example/",
  });
  await mockCapture(page, { failWith: "private-host" });
  await openFolder(page);
  await createUrlProject(page, "internal.example", "Internal site");
  await page.getByTestId("mode-comment").click();
  await expect(failed).toContainText("public sites");
  await failed.getByTestId("screenshot-input").setInputFiles({
    name: "internal.png",
    mimeType: "image/png",
    buffer: await samplePng(page, "Internal"),
  });
  await expect(
    page.getByRole("img", { name: /Internal site, the image under review/ }),
  ).toBeVisible();
});

test("an image comment gets a screenshot that survives delete and undo", async ({ page }) => {
  await openFolder(page);
  await createImageProject(page, "crop-check.png");
  await postComment(page, "Logo too small.", { x: 100, y: 80 }, "Leo");
  await showComments(page);
  const card = onlyCommentCard(page);
  await expect(card.getByTestId("comment-crop").locator("img")).toBeVisible();

  await card.getByRole("button", { name: "Delete comment 1" }).click();
  await page
    .getByRole("dialog", { name: "Delete comment 1?" })
    .getByRole("button", { name: "Delete comment" })
    .click();
  await expect(card).toHaveCount(0);
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect(card.getByTestId("comment-crop").locator("img")).toBeVisible();
});

test("undoing a delete doesn't reopen the comment's popover", async ({ page }) => {
  await openFolder(page);
  await createImageProject(page, "popover-undo.png");
  await postComment(page, "Button too close.", { x: 100, y: 80 }, "Leo");
  await hideComments(page);
  await page.getByRole("button", { name: "Comment 1 by Leo", exact: true }).click();
  const popover = page.getByTestId("pin-popover");
  await expect(popover).toBeVisible();

  // Space, since a click (or Enter on a pressable button) outside the popover closes it first.
  const showToggle = page.getByRole("button", { name: /Show comments/ });
  if (await showToggle.isVisible()) await showToggle.press("Space");
  await onlyCommentCard(page).getByRole("button", { name: "Delete comment 1" }).press("Space");
  await page
    .getByRole("dialog", { name: "Delete comment 1?" })
    .getByRole("button", { name: "Delete comment" })
    .press("Space");
  await expect(popover).toHaveCount(0);
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).press("Space");
  await expect(onlyCommentCard(page)).toBeVisible();
  await expect(popover).not.toBeVisible();
});

test("projects saved before snapshots still load, with website pins labelled Live page", async ({
  page,
  baseURL,
}) => {
  const image = `data:image/png;base64,${snapshotPng(600, 400).toString("base64")}`;
  const legacy = {
    ...LEGACY_V1,
    projects: [
      { ...LEGACY_V1.projects[0], source: { kind: "url", url: `${baseURL}/sandbox` } },
      { ...LEGACY_V1.projects[1], source: { ...LEGACY_V1.projects[1].source, dataUrl: image } },
    ],
  };
  await mockFrameCheck(page, {
    verdict: "embeddable",
    finalUrl: `${baseURL}/sandbox`,
    status: 200,
  });
  await mockCapture(page);
  await page.goto("/sandbox");
  await page.evaluate((data) => localStorage.setItem("squint:v1", JSON.stringify(data)), legacy);

  await page.goto("/p/site");
  await expect(page.getByTestId("preview-frame")).toBeVisible();
  const legacyPin = page.getByRole("button", { name: "Comment 1 by Ana", exact: true });
  await expect(legacyPin).toBeVisible();
  await showComments(page);
  const card = onlyCommentCard(page);
  await expect(card.getByTestId("placement-chip")).toHaveAttribute("data-placement", "live");
  await expect(card.getByTestId("comment-crop")).toHaveCount(0);

  // The snapshot doesn't carry frame-anchored pins; selecting one goes back to the live frame.
  await page.getByTestId("mode-comment").click();
  await expect(snapshotImage(page)).toBeVisible();
  await expect(legacyPin).toHaveCount(0);
  await card.getByRole("button", { name: /Comment 1 by Ana/ }).click();
  await expect(page.getByTestId("canvas-area")).toHaveAttribute("data-mode", "browse");
  await expect(legacyPin).toBeVisible();

  await page.goto("/p/mock");
  await showComments(page);
  await page.getByTestId("tab-resolved").click();
  await expect(
    page.getByRole("button", { name: "Comment 1 by Leo, resolved", exact: true }),
  ).toBeVisible();

  // Version 1 was migrated: its image moved to IndexedDB, comments carried over as they were.
  const stored = await page.evaluate(() => ({
    v1: localStorage.getItem("squint:v1"),
    v2: JSON.parse(localStorage.getItem("squint:v2") ?? "{}") as {
      comments: unknown[];
      projects: Array<{ source: Record<string, unknown> }>;
    },
  }));
  expect(stored.v1).toBeNull();
  expect(stored.v2.comments).toEqual(LEGACY_V1.comments);
  expect(stored.v2.projects[1]?.source).toMatchObject({ kind: "image", blobKey: "image:mock" });
  expect(stored.v2.projects[1]?.source).not.toHaveProperty("dataUrl");
});

test("undoing a delete keeps the earlier snapshot it was on, however long Undo waits", async ({
  page,
  baseURL,
}) => {
  // The sweep (and snapshot pruning) runs after 300 ms here instead of a minute.
  await page.addInitScript(() => {
    (window as Window & { __squintBlobGraceMs?: number }).__squintBlobGraceMs = 300;
  });
  await mockCapture(page);
  await sandboxProject(page, baseURL, "Undo keeper");
  await page.getByTestId("mode-comment").click();
  await expect(snapshotImage(page)).toBeVisible();
  await postComment(page, "On the first snapshot", { x: 140, y: 120 }, "Ana");
  await page.getByRole("button", { name: "Refresh snapshot" }).click();
  await expect(page.getByRole("button", { name: "Comment 1 by Ana", exact: true })).toHaveCount(0);

  await showComments(page);
  const card = onlyCommentCard(page);
  await expect(card.getByTestId("placement-chip")).toHaveAttribute("data-placement", "earlier");
  await card.getByRole("button", { name: "Delete comment 1" }).click();
  await page
    .getByRole("dialog", { name: "Delete comment 1?" })
    .getByRole("button", { name: "Delete comment" })
    .click();

  // Hold the Undo toast open well past the (shortened) grace, so the sweep runs meanwhile.
  const toast = page.getByTestId("toast").filter({ hasText: "Comment deleted" });
  await toast.hover();
  await page.waitForTimeout(1_500);
  await toast.getByRole("button", { name: "Undo" }).click();

  await expect(card.getByTestId("placement-chip")).toHaveAttribute("data-placement", "earlier");
  await card.getByRole("button", { name: /Comment 1 by Ana/ }).click();
  await expect(page.getByTestId("snapshot-bar")).toContainText("Earlier snapshot");
  await expect(snapshotImage(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Comment 1 by Ana", exact: true })).toBeVisible();
});
