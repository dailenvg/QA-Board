import { expect, test } from "@playwright/test";
import { TOKEN } from "./fixtures";

test("/review-link shows the shareable URL and copies it", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });

  const response = await page.goto("/review-link");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  const field = page.getByTestId("review-link-url");
  await expect(field).toHaveValue(`${baseURL}/?review=${TOKEN}`);

  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${baseURL}/?review=${TOKEN}`,
  );
});
