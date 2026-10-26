import { expect, type Locator, type Page } from "@playwright/test";
import type { CaptureErrorCode } from "../lib/capture/types";
import type { FrameCheckResult } from "../lib/frame-check/types";
import type { SquintData } from "../lib/store/types";
import { snapshotPng } from "./sample-snapshot";

/** Answers /api/frame-check locally so tests never depend on the network. */
export async function mockFrameCheck(page: Page, result: FrameCheckResult): Promise<void> {
  await page.route("**/api/frame-check?**", (route) => route.fulfill({ json: result }));
}

export const SNAPSHOT_HEIGHT = 2400;

/**
 * Answers /api/capture locally (a striped PNG at the requested width, or an
 * error), so tests never launch a browser or touch the network. Returns how
 * many captures were asked for.
 */
export async function mockCapture(
  page: Page,
  { failWith, delayMs = 0 }: { failWith?: CaptureErrorCode; delayMs?: number } = {},
): Promise<() => number> {
  let calls = 0;
  await page.unroute("**/api/capture");
  await page.route("**/api/capture", async (route) => {
    calls += 1;
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (failWith) {
      await route.fulfill({ status: 502, json: { error: failWith } });
      return;
    }
    const { width } = route.request().postDataJSON() as { width: number };
    await route.fulfill({
      contentType: "image/png",
      headers: { "x-capture-width": String(width), "x-capture-height": String(SNAPSHOT_HEIGHT) },
      body: snapshotPng(width, SNAPSHOT_HEIGHT),
    });
  });
  return () => calls;
}

/** The seeded folder every fresh browser starts with. */
export const DEFAULT_FOLDER = { id: "default", name: "My projects" } as const;

/** Opens a folder's page. Creating a project there opens it in the viewer. */
export async function openFolder(page: Page, id: string = DEFAULT_FOLDER.id): Promise<void> {
  await page.goto(`/f/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** Opens the Overview and waits for the store to load. */
export async function openOverview(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("overview-hero")).toBeVisible();
}

export const OVERVIEW_HEADLINE = { empty: "Welcome to Squint", filled: "Everything up for review" };

function newProjectDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "New project" });
}

export async function createUrlProject(page: Page, url: string, name: string): Promise<void> {
  await page.getByTestId("new-project").click();
  const dialog = newProjectDialog(page);
  await dialog.getByLabel("Website address").fill(url);
  await dialog.getByLabel("Project name").fill(name);
  await dialog.getByTestId("create-project").click();
  await expect(page).toHaveURL(/\/p\/[^/]+$/);
}

/** Creates an image project through the dialog, leaving the name to its file-name fallback. */
export async function createImageProject(page: Page, fileName: string): Promise<void> {
  const buffer = await samplePng(page);
  await page.getByTestId("new-project").click();
  const dialog = newProjectDialog(page);
  await dialog.getByRole("radio", { name: "Image" }).click();
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({ name: fileName, mimeType: "image/png", buffer });
  // The name shows as soon as the file is chosen; Create waits until it's prepared.
  await expect(
    dialog
      .locator('[data-testid="picked-image"][data-status="ready"]')
      .filter({ hasText: fileName }),
  ).toHaveCount(1);
  await dialog.getByTestId("create-project").click();
  await expect(page.getByRole("img", { name: /the image under review/ })).toBeVisible();
}

/** Browser-drawn PNGs named `<label>.png` (lowercase), each showing its label; `heights` by label. */
export async function samplePngFiles(
  page: Page,
  labels: readonly string[],
  heights: Readonly<Record<string, number>> = {},
): Promise<Array<{ name: string; mimeType: string; buffer: Buffer }>> {
  const files = [];
  for (const label of labels) {
    files.push({
      name: `${label.toLowerCase()}.png`,
      mimeType: "image/png",
      buffer: await samplePng(page, label, heights[label]),
    });
  }
  return files;
}

/** Chooses images in the New project dialog and waits until each is prepared. */
export async function pickImages(
  page: Page,
  files: ReadonlyArray<{ name: string; mimeType: string; buffer: Buffer }>,
): Promise<Locator> {
  await page.getByTestId("new-project").click();
  const dialog = newProjectDialog(page);
  await dialog.getByRole("radio", { name: "Image" }).click();
  await dialog.locator('input[type="file"]').setInputFiles([...files]);
  await expect(dialog.locator('[data-testid="picked-image"][data-status="ready"]')).toHaveCount(
    files.length,
  );
  return dialog;
}

/** Drops a pin and posts a comment; `author` is only asked for on the first comment. */
export async function postComment(
  page: Page,
  body: string,
  position: { x: number; y: number },
  author?: string,
): Promise<void> {
  const composer = await dropPin(page, position);
  if (author) await composer.getByLabel("Your name").fill(author);
  await composer.getByLabel("Comment", { exact: true }).fill(body);
  await composer.getByLabel("Comment", { exact: true }).press("Enter");
  await expect(composer).toHaveCount(0);
}

/**
 * A real PNG, drawn by the browser, so the upload goes through decoding and
 * downscaling. 1200 px wide, `height` tall.
 */
export async function samplePng(page: Page, label = "Mockup", height = 900): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ({ text, tall }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = tall;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no canvas");
      context.fillStyle = "#d8fc6c";
      context.fillRect(0, 0, 1200, tall);
      context.fillStyle = "#0c54cc";
      context.font = "bold 96px sans-serif";
      context.fillText(text, 80, 200);
      return canvas.toDataURL("image/png");
    },
    { text: label, tall: height },
  );
  return Buffer.from(dataUrl.split(",")[1] ?? "", "base64");
}

/** The comments panel is a collapsed bottom sheet on small screens. */
export async function showComments(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: /Show comments/ });
  if (await toggle.isVisible()) await toggle.click();
}

/** Collapses the comments bottom sheet on small screens, uncovering the canvas. */
export async function hideComments(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: /Hide comments/ });
  if (await toggle.isVisible()) await toggle.click();
}

export function topBarStatus(page: Page): Locator {
  return page.getByRole("banner").getByTestId("status-chip");
}

/** The only comment card in the list (the specs keep one comment at a time). */
export function onlyCommentCard(page: Page): Locator {
  return page.getByTestId("comment-card");
}

/** Switches to comment mode and clicks the canvas, returning the open composer. */
export async function dropPin(page: Page, position = { x: 120, y: 90 }): Promise<Locator> {
  await page.getByTestId("mode-comment").click();
  await page.getByTestId("comment-overlay").click({ position });
  const composer = page.getByTestId("composer");
  await expect(composer).toBeVisible();
  return composer;
}

/** A folder's card on the Overview, by the folder's name. */
export function folderCard(page: Page, name: string): Locator {
  return page.getByTestId("folder-card").filter({ hasText: name });
}

/**
 * How far a folder sheet sits from its resting place vertically, in px: positive
 * while tucked into the pocket, strongly negative while the folder fans out.
 */
export async function sheetLift(sheet: Locator): Promise<number> {
  return sheet.evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m42);
}

/** Replaces this browser's workspace with `data`, then opens `path`. Pictures aren't stored. */
export async function seedWorkspace(page: Page, data: SquintData, path = "/"): Promise<void> {
  await page.goto("/sandbox");
  await page.evaluate((seed) => localStorage.setItem("squint:v3", JSON.stringify(seed)), data);
  await page.goto(path);
}

/** Waits until `locator` and everything above it are fully faded in, so axe sees real colors. */
export async function settled(locator: Locator): Promise<void> {
  await expect
    .poll(() =>
      locator.evaluateAll((elements) =>
        elements.every((element) => {
          for (let node: Element | null = element; node; node = node.parentElement) {
            if (getComputedStyle(node).opacity !== "1") return false;
          }
          return true;
        }),
      ),
    )
    .toBe(true);
}
