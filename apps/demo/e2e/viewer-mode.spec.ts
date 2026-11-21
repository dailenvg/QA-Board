import type { Page } from "@playwright/test";
import type { FrameCheckResult } from "../lib/frame-check/types";
import { expect, test } from "./test";
import {
  createImageProject,
  createUrlProject,
  mockCapture,
  mockFrameCheck,
  openFolder,
} from "./squint-fixtures";

const BLOCKED: FrameCheckResult = {
  verdict: "blocked",
  reason: "x-frame-options",
  finalUrl: "https://blocked.example/",
};

/** Answers the frame check after `delayMs`, so a test can look at the viewer while it waits. */
async function slowFrameCheck(page: Page, result: FrameCheckResult, delayMs: number) {
  await page.route("**/api/frame-check?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({ json: result });
  });
}

function modeOption(page: Page, mode: "browse" | "comment") {
  return page.getByTestId(`mode-${mode}`);
}

/** What screen readers hear when a site that refuses framing opens on its snapshot. */
function openedOnSnapshot(page: Page) {
  return page
    .getByRole("status")
    .filter({
      hasText: "This site can't be shown here, so it opened on a snapshot in Comment mode.",
    });
}

/** Every mode remembered in this browser. */
function storedModes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith("squint:viewer-mode:"))
      .map((key) => localStorage.getItem(key) ?? ""),
  );
}

test("a site that refuses framing opens on its snapshot in Comment mode, Browse a click away", async ({
  page,
}) => {
  await mockCapture(page);
  await slowFrameCheck(page, BLOCKED, 1_500);
  await openFolder(page);
  await createUrlProject(page, "blocked.example", "Blocked site");

  // While the check runs, neither mode is picked and the site's refusal never shows.
  await expect(modeOption(page, "browse")).toHaveAttribute("aria-checked", "false");
  await expect(modeOption(page, "comment")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("frame-fallback")).toBeHidden();
  await expect(openedOnSnapshot(page)).toHaveCount(0);

  await expect(modeOption(page, "comment")).toHaveAttribute("aria-checked", "true");
  await expect(openedOnSnapshot(page)).toHaveCount(1);
  await expect(page.getByTestId("canvas-area")).toHaveAttribute("data-mode", "comment");
  await expect(page.getByRole("img", { name: /^Snapshot of/ })).toBeVisible();
  await expect(page.getByTestId("frame-fallback")).toBeHidden();

  await modeOption(page, "browse").click();
  await expect(page.getByTestId("frame-fallback")).toContainText("This site can't be shown here");

  // Browse is remembered as picked, yet the site still opens on its snapshot, and says so.
  await page.reload();
  await expect(modeOption(page, "comment")).toHaveAttribute("aria-checked", "true");
  await expect(openedOnSnapshot(page)).toHaveCount(1);
  expect(await storedModes(page)).toEqual(["browse"]);
});

test("the mode last picked for a project opens again after a reload", async ({ page, baseURL }) => {
  await mockFrameCheck(page, {
    verdict: "embeddable",
    finalUrl: `${baseURL}/sandbox`,
    status: 200,
  });
  await mockCapture(page);
  await openFolder(page);
  await createUrlProject(page, `${baseURL}/sandbox`, "Remembered mode");
  await expect(modeOption(page, "browse")).toHaveAttribute("aria-checked", "true");
  expect(await storedModes(page)).toEqual([]);

  await modeOption(page, "comment").click();
  await expect(page.getByRole("img", { name: /^Snapshot of/ })).toBeVisible();
  await page.reload();
  await expect(modeOption(page, "comment")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("img", { name: /^Snapshot of/ })).toBeVisible();
  // Opened in the remembered mode, not put there by a refusal: nothing to announce.
  await expect(openedOnSnapshot(page)).toHaveCount(0);

  await modeOption(page, "browse").click();
  await page.reload();
  await expect(modeOption(page, "browse")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("preview-frame")).toBeVisible();
});

test("creating a website project starts its snapshot, and opening it joins that one", async ({
  page,
  baseURL,
}) => {
  await mockFrameCheck(page, {
    verdict: "embeddable",
    finalUrl: `${baseURL}/sandbox`,
    status: 200,
  });
  const captures = await mockCapture(page, { delayMs: 2_000 });
  await openFolder(page);
  const started = page.waitForRequest("**/api/capture");
  await createUrlProject(page, `${baseURL}/sandbox`, "Early snapshot");
  expect(((await started).postDataJSON() as { width: number }).width).toBe(1440);

  // Still on its way: Comment mode waits for it instead of asking for another.
  await modeOption(page, "comment").click();
  await expect(page.getByTestId("capture-progress")).toBeVisible();
  await expect(page.getByRole("img", { name: /^Snapshot of/ })).toBeVisible();
  expect(captures()).toBe(1);

  // An image project has nothing to capture.
  await openFolder(page);
  await createImageProject(page, "no-capture.png");
  expect(captures()).toBe(1);
});
