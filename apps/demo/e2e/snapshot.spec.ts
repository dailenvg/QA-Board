import { expect, test, type Page } from "@playwright/test";
import { LEGACY_V1 } from "../test/legacy-v1";
import { snapshotPng } from "./sample-snapshot";
import {
  createImageProject,
  createUrlProject,
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

async function pinTop(page: Page, name: string): Promise<number> {
  const box = await page.getByRole("button", { name, exact: true }).boundingBox();
  if (!box) throw new Error(`${name} isn't on screen`);
  return box.y;
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

  // The pin rides along with the snapshot as the canvas scrolls.
  const area = page.getByTestId("canvas-area");
  const before = await pinTop(page, pinName);
  await area.evaluate((node) => node.scrollBy({ top: 300, behavior: "instant" }));
  await expect.poll(async () => before - (await pinTop(page, pinName))).toBeCloseTo(300, 0);
  await area.evaluate((node) => node.scrollTo({ top: 0, behavior: "instant" }));

  await showComments(page);
  const crop = onlyCommentCard(page).getByTestId("comment-crop");
  await expect(crop.locator("img")).toBeVisible();
  await crop.click();
  const dialog = page.getByTestId("crop-dialog");
  await expect(dialog.getByRole("img", { name: "The page around pin 1" })).toBeVisible();
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
  await expect(card.getByTestId("placement-chip")).toHaveAttribute("data-placement", "earlier");

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

  const saved = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("squint:v1") ?? "{}") as {
        comments: unknown[];
      },
  );
  expect(saved.comments).toEqual(LEGACY_V1.comments);
});
