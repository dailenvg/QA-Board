import { expect, test } from "./test";

test("dark mode, in the account menu, switches the theme in place and persists across reloads", async ({
  page,
}) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "light");

  const trigger = page.getByTestId("account-menu");
  await trigger.click();
  const darkMode = page.getByRole("menuitemcheckbox", { name: "Dark mode" });
  await expect(darkMode).toHaveAttribute("aria-checked", "false");
  await darkMode.click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  // A setting toggles in place: the menu stays open on it.
  await expect(darkMode).toHaveAttribute("aria-checked", "true");
  await expect(darkMode).toBeFocused();

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");

  // By keyboard: arrows step over the separator, Home and End reach the ends, Escape goes back.
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  const account = page.getByRole("menuitem", { name: "Account" });
  await expect(account).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(darkMode).toBeFocused();
  await expect(darkMode).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("sign-out")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(account).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByTestId("sign-out")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(darkMode).toBeFocused();
  await page.keyboard.press("Space");
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(darkMode).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  await expect(darkMode).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
});

test("the phone header's toggle switches the theme too", async ({ page, isMobile }) => {
  test.skip(!isMobile, "The header toggle is for the stacked layout below lg.");
  await page.goto("/");
  const html = page.locator("html");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
});

test("the account menu opens above its trigger and stays on screen", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByTestId("account-menu");
  await trigger.scrollIntoViewIfNeeded();
  const box = await trigger.boundingBox();
  expect(box && box.width >= 44 && box.height >= 44).toBe(true);
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Account menu" });
  await expect(menu).toBeVisible();
  // Polled: the menu pops in from slightly smaller.
  await expect
    .poll(async () => {
      const rect = await menu.boundingBox();
      const viewport = page.viewportSize();
      if (!rect || !box || !viewport) return false;
      return (
        rect.y >= 0 &&
        rect.y + rect.height <= box.y + 1 &&
        rect.x >= 0 &&
        rect.x + rect.width <= viewport.width
      );
    })
    .toBe(true);
});
