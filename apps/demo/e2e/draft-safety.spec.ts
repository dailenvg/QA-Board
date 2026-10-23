import { expect, test } from "@playwright/test";
import { centre, openWithToken } from "./fixtures";

test("an unsent draft survives page clicks and needs a second Escape to discard", async ({
  page,
}, testInfo) => {
  const ui = await openWithToken(page);
  await ui.commentToggle.click();
  const card = page.getByTestId("pricing-card-self-hosted");
  await centre(card);
  await card.click({ position: { x: 48, y: 48 } });

  const comment = ui.popover.getByLabel("Comment", { exact: true });
  await comment.fill("Unsent thoughts about this card");
  const urlBefore = page.url();

  // A page control that would normally act: the nav link on desktop, the menu toggle on mobile.
  if (testInfo.project.name === "mobile") {
    const menu = page.getByRole("button", { name: "Open menu" });
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
  } else {
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "FAQ" })
      .click();
  }

  expect(page.url()).toBe(urlBefore);
  await expect(comment).toHaveValue("Unsent thoughts about this card");
  await expect(comment).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(ui.popover.getByTestId("pp-discard-notice")).toBeVisible();
  await expect(ui.popover).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(ui.popover).toHaveCount(0);
});
