import { expect, test } from "@playwright/test";
import { centre, createPin, openCount, openWithToken, uniqueName, widget } from "./fixtures";

test("drops a pin on a pricing card through comment mode", async ({ page }) => {
  const ui = await openWithToken(page);
  const before = await openCount(page);
  const author = uniqueName("Ana");

  await ui.commentToggle.click();
  await expect(ui.commentToggle).toHaveAttribute("aria-pressed", "true");

  const card = page.getByTestId("pricing-card-team");
  await centre(card);
  await card.click({ position: { x: 48, y: 48 } });

  await expect(ui.popover.getByRole("heading", { name: "New comment" })).toBeVisible();
  await ui.popover.getByLabel("Your name", { exact: true }).fill(author);
  await ui.popover
    .getByLabel("Comment", { exact: true })
    .fill("Make the Team plan stand out more.");
  await ui.popover.getByText("Must", { exact: true }).click();
  await ui.popover.getByRole("button", { name: "Post comment" }).click();

  await expect(ui.popover).toHaveCount(0);
  await expect(ui.pinBy(author)).toBeVisible();
  await expect(ui.count).toHaveText(String(before + 1));

  const badge = await ui.pinBy(author).boundingBox();
  const cardBox = await card.boundingBox();
  expect(badge && cardBox).toBeTruthy();
  if (badge && cardBox) {
    const tip = { x: badge.x + 8, y: badge.y + 36 };
    expect(tip.x).toBeGreaterThan(cardBox.x);
    expect(tip.x).toBeLessThan(cardBox.x + cardBox.width);
    expect(tip.y).toBeGreaterThan(cardBox.y);
    expect(tip.y).toBeLessThan(cardBox.y + cardBox.height);
  }
});

test("pins persist across reloads", async ({ page, request }) => {
  const author = uniqueName("Reload");
  await createPin(request, {
    author,
    body: "Still here after reload?",
    testId: "pricing-card-self-hosted",
  });

  const ui = await openWithToken(page);
  await expect(ui.pinBy(author)).toHaveCount(1);

  await page.reload();
  await expect(widget(page).count).toBeVisible();
  await expect(widget(page).pinBy(author)).toHaveCount(1);
});

test("?pin=<id> scrolls to the pin and opens its thread", async ({ page, request }) => {
  const author = uniqueName("Deep");
  const pin = await createPin(request, {
    author,
    body: "Deep-linked feedback on the Organization plan.",
    testId: "pricing-card-organization",
  });

  await page.goto(`/?review=e2e-token&pin=${pin.id}`);
  const ui = widget(page);

  await expect(
    ui.popover.getByText("Deep-linked feedback on the Organization plan."),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`\\?pin=${pin.id}$`));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  await expect(ui.pinBy(author)).toBeInViewport();
});

test("reply, resolve, and reveal resolved pins with the toggle", async ({ page, request }) => {
  const author = uniqueName("Thread");
  const pin = await createPin(request, {
    author,
    body: "Please tighten this copy.",
    testId: "pricing-card-team",
  });

  await page.goto(`/?review=e2e-token&pin=${pin.id}`);
  const ui = widget(page);
  await expect(ui.popover.getByText("Please tighten this copy.")).toBeVisible();

  await ui.popover.getByLabel("Your name", { exact: true }).fill("Reviewer");
  await ui.popover.getByLabel("Reply", { exact: true }).fill("Agreed, shorter is better.");
  await ui.popover.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(ui.popover.getByRole("list", { name: "Replies" })).toContainText(
    "Agreed, shorter is better.",
  );

  await ui.popover.getByRole("button", { name: "Resolve" }).click();
  await expect(ui.popover.getByText("Resolved", { exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(ui.popover).toHaveCount(0);
  await expect(ui.pinBy(author)).toHaveCount(0);

  await ui.showResolved.click();
  await expect(ui.pinBy(author)).toHaveCount(1);
  await expect(ui.pinBy(author)).toHaveAttribute("aria-label", /resolved/);
});

test("Escape exits comment mode", async ({ page }) => {
  const ui = await openWithToken(page);

  await ui.commentToggle.click();
  await expect(ui.commentToggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("style[data-pinpoint-cursor]")).toHaveCount(1);

  await page.keyboard.press("Escape");

  await expect(ui.commentToggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("style[data-pinpoint-cursor]")).toHaveCount(0);
});
