import { expect, test } from "@playwright/test";
import { TOKEN, widget } from "./fixtures";

test("without a token there is no widget and no pinpoint request", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/pinpoint")) calls.push(request.url());
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(widget(page).root).toHaveCount(0);
  expect(calls).toEqual([]);
});

test("?review= activates the widget and is stripped from the URL", async ({ page }) => {
  const listRequest = page.waitForRequest(
    (request) => request.url().includes("/api/pinpoint?path=%2F") && request.method() === "GET",
  );

  await page.goto(`/?review=${TOKEN}&utm_source=e2e`);

  const request = await listRequest;
  expect(request.headers()["x-pinpoint-token"]).toBe(TOKEN);
  await expect(page).toHaveURL(/\/\?utm_source=e2e$/);
  await expect(widget(page).toolbar).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("pinpoint:review-token"))).toContain(TOKEN);
});

test("an invalid token hides the widget and is forgotten", async ({ page }) => {
  const statuses: number[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/pinpoint")) statuses.push(response.status());
  });

  await page.goto("/?review=wrong-token");

  await expect.poll(() => statuses).toEqual([401]);
  await expect(widget(page).root).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("pinpoint:review-token"))).toBeNull();
});
