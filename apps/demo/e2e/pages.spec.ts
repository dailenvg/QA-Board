import { expect, test } from "@playwright/test";
import { openFolder, pickImages, samplePngFiles } from "./squint-fixtures";

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
  await page.getByTestId("new-project").click();
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
