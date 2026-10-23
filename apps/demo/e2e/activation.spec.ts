import { expect, test, type Page } from "@playwright/test";
import { TOKEN, widget } from "./fixtures";

/** A custom property that only exists in the overlay's stylesheet, i.e. in the lazy UI chunk. */
const OVERLAY_MARKER = "--pp-accent";

/** Bodies of every same-origin script the page downloads. */
function collectScripts(page: Page): Promise<string>[] {
  const bodies: Promise<string>[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() === "script")
      bodies.push(response.text().catch(() => ""));
  });
  return bodies;
}

test("without a token there is no widget, no pinpoint request, and no overlay code", async ({
  page,
}) => {
  const scripts = collectScripts(page);
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/pinpoint")) calls.push(request.url());
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(widget(page).root).toHaveCount(0);
  expect(calls).toEqual([]);
  const downloaded = await Promise.all(scripts);
  expect(downloaded.length).toBeGreaterThan(0);
  expect(downloaded.some((body) => body.includes(OVERLAY_MARKER))).toBe(false);
});

test("with a token the overlay chunk is loaded on demand", async ({ page }) => {
  const scripts = collectScripts(page);
  await page.goto(`/?review=${TOKEN}`);
  await expect(widget(page).toolbar).toBeVisible();
  const downloaded = await Promise.all(scripts);
  expect(downloaded.some((body) => body.includes(OVERLAY_MARKER))).toBe(true);
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
