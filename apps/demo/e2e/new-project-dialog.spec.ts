import type { Locator } from "@playwright/test";
import { expect, test } from "./test";
import { newProjectButton, openFolder } from "./squint-fixtures";

/** The laid-out height in px, whatever the dialog's entrance scale is doing. */
function height(locator: Locator): Promise<number> {
  return locator.evaluate((element) => (element as HTMLElement).offsetHeight);
}

test("New project keeps one height on every source, within the screen", async ({ page }) => {
  await openFolder(page);
  await newProjectButton(page).click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await expect(dialog).toBeVisible();
  const source = dialog.getByRole("radiogroup", { name: "Project source" });

  const heights: Record<string, number> = {};
  for (const option of ["Website", "Image", "PDF", "Website"]) {
    await source.getByRole("radio", { name: option }).click();
    await expect(source.getByRole("radio", { name: option })).toBeChecked();
    // Settled: the chosen panel is the only one shown.
    await expect(dialog.locator("[data-active]")).toHaveCount(1);
    heights[option] = await height(dialog);
  }
  expect(new Set(Object.values(heights)).size).toBe(1);

  // Never taller than the screen: a phone scrolls inside it instead.
  const viewport = page.viewportSize();
  expect(heights.Website).toBeLessThanOrEqual(viewport?.height ?? Infinity);
  // Only the chosen source's fields can be reached.
  await expect(dialog.getByLabel("Website address")).toBeVisible();
  await expect(dialog.getByTestId("image-dropzone")).toBeHidden();
  await expect(dialog.getByTestId("pdf-dropzone")).toBeHidden();
});
