import { expect, test } from "@playwright/test";

test("the theme toggle switches to dark and persists across reloads", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "light");

  await page
    .getByRole("button", { name: "Switch to dark theme" })
    .filter({ visible: true })
    .click();
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  const toLight = page
    .getByRole("button", { name: "Switch to light theme" })
    .filter({ visible: true });
  await expect(toLight).toBeVisible();

  await toLight.click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
});
