import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

export const TOKEN = "e2e-token";

export interface PinSummary {
  id: string;
  author: string;
  body: string;
}

/** Unique per call so tests never depend on pins left by other tests. */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function widget(page: Page) {
  const root = page.locator("pinpoint-root");
  return {
    root,
    toolbar: root.locator(".pp-toolbar"),
    commentToggle: root.locator("button.pp-btn--toggle-primary"),
    count: root.locator(".pp-count"),
    popover: root.locator(".pp-popover[data-state='open']"),
    pins: root.locator("button.pp-pin"),
    pinBy: (author: string): Locator => root.locator(`button.pp-pin[aria-label*="by ${author}"]`),
    showResolved: root.locator("button[aria-label^='Show resolved']"),
  };
}

/** Opens the page with the review token and waits until pins have loaded. */
export async function openWithToken(page: Page, query = ""): Promise<ReturnType<typeof widget>> {
  await page.goto(`/?review=${TOKEN}${query}`);
  const ui = widget(page);
  await expect(ui.count).toBeVisible();
  return ui;
}

export async function openCount(page: Page): Promise<number> {
  return Number(await widget(page).count.textContent());
}

/** Creates a pin through the API, anchored to a pricing card. */
export async function createPin(
  request: APIRequestContext,
  { author, body, testId }: { author: string; body: string; testId: string },
): Promise<PinSummary> {
  const response = await request.post("/api/pinpoint", {
    headers: { "x-pinpoint-token": TOKEN },
    data: {
      path: "/",
      pageUrl: "http://127.0.0.1:3100/",
      anchor: {
        selector: `[data-testid="${testId}"]`,
        xPct: 20,
        yPct: 15,
        viewportXPct: 50,
        viewportYPct: 50,
      },
      author,
      body,
      priority: "should",
      screenshot: null,
      context: { viewport: { width: 1280, height: 800 }, userAgent: "playwright" },
    },
  });
  expect(response.status()).toBe(201);
  const { pin } = (await response.json()) as { pin: PinSummary };
  return pin;
}

/** Centres an element so neither the sticky header nor the toolbar covers it. */
export async function centre(locator: Locator): Promise<void> {
  await locator.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
}
