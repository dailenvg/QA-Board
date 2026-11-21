import type { Page } from "@playwright/test";
import type { FrameCheckResult } from "../lib/frame-check/types";
import { expect, test } from "./test";
import { createUrlProject, mockCapture, mockFrameCheck, openFolder } from "./squint-fixtures";

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

  await expect(modeOption(page, "comment")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("canvas-area")).toHaveAttribute("data-mode", "comment");
  await expect(page.getByRole("img", { name: /^Snapshot of/ })).toBeVisible();
  await expect(page.getByTestId("frame-fallback")).toBeHidden();

  await modeOption(page, "browse").click();
  await expect(page.getByTestId("frame-fallback")).toContainText("This site can't be shown here");

  // Browse is remembered as picked, yet the site still opens on its snapshot.
  await page.reload();
  await expect(modeOption(page, "comment")).toHaveAttribute("aria-checked", "true");
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

  await modeOption(page, "browse").click();
  await page.reload();
  await expect(modeOption(page, "browse")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("preview-frame")).toBeVisible();
});
