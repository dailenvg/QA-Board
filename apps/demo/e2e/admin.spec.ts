import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./test";
import { sessionCookie, signIn, SIGNED_OUT } from "./auth-fixtures";
import { resetAdminPassword, seedAuditTrail } from "./admin-db";
import { E2E_ADMIN, E2E_COMPANY } from "./e2e-env";

/** Signs this browser in as the admin, straight through the database (no sign-in form). */
async function asAdmin(page: Page, baseURL: string | undefined): Promise<void> {
  await page.context().addCookies([await sessionCookie(E2E_ADMIN.email, baseURL ?? "")]);
}

/** Picks `option` in the audit log's `filter` select. */
async function pickFilter(page: Page, filter: string, option: string | RegExp): Promise<void> {
  await page.getByTestId(`audit-filter-${filter}`).click();
  await page.getByRole("option", { name: option }).click();
}

const entries = (page: Page) => page.getByTestId("audit-entry");

/**
 * Brings every revealing element on the page into view, a frame apart so each
 * one's reveal starts, and waits until none is still fading in, so axe reads
 * colors at full opacity.
 */
async function settle(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const fading = () =>
          [...document.querySelectorAll<HTMLElement>('#main [style*="opacity"]')].filter(
            (element) => getComputedStyle(element).opacity !== "1",
          );
        for (const element of fading()) {
          element.scrollIntoView({ block: "center" });
          await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        }
        return fading().length;
      }),
    )
    .toBe(0);
}

async function expectAccessible(page: Page): Promise<void> {
  await settle(page);
  const results = await new AxeBuilder({ page }).include("#main").analyze();
  expect(results.violations).toEqual([]);
}

test.describe("the admin", () => {
  test.use({ storageState: SIGNED_OUT });

  test("signs in and lands on the admin Overview, its counts and activity", async ({ page }) => {
    await resetAdminPassword();
    await page.goto("/login");
    await signIn(page, E2E_ADMIN);
    // The welcome flag is cleared once it's read.
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { level: 1, name: "Admin" })).toBeVisible();
    const nav = page.getByTestId("admin-nav");
    await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.getByRole("link")).toHaveText(["Overview", "Audit log"]);
    // The seed made two workspaces with an owner each, and the admin.
    await expect(page.getByTestId("admin-stat-workspaces-value")).toHaveText(/^\d+$/);
    expect(
      Number(await page.getByTestId("admin-stat-workspaces-value").textContent()),
    ).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId("admin-stat-storageBytes-value")).toHaveText(/\d+(\.\d)? \w+/);
    await expect(page.getByTestId("admin-activity")).toBeVisible();
    // The seed's own entries are on record today, so the last 30 days are never empty here.
    await expect(page.getByTestId("admin-activity-total")).toHaveText(
      /^[\d,]+ (entry|entries) in the last 30 days$/,
    );
    await expect(page.getByTestId("admin-activity-chart")).toHaveAttribute(
      "aria-label",
      /^All activity: [\d,]+ (entry|entries) in the last 30 days, most on \w{3} \d{1,2}\.$/,
    );
    await expectAccessible(page);
  });

  test("filters the audit log by workspace, actor and action, and pages through it", async ({
    page,
    baseURL,
  }) => {
    const trail = await seedAuditTrail(55);
    await asAdmin(page, baseURL);
    await page.goto("/admin");
    await page.getByTestId("admin-nav").getByRole("link", { name: "Audit log" }).click();
    await expect(page).toHaveURL(/\/admin\/audit$/);
    await expect(entries(page).first()).toBeVisible();

    await pickFilter(page, "workspace", `Deleted workspace ${trail.workspaceId}`);
    await expect(page).toHaveURL(new RegExp(`\\?workspace=${trail.workspaceId}$`));
    await expect(entries(page)).toHaveCount(50);
    // Newest first: Squint's deletion came last.
    const newest = entries(page).first();
    await expect(newest).toHaveAttribute("data-action", "project.deleted");
    await expect(newest.getByTestId("audit-actor")).toHaveText("Squint");
    await expect(newest.getByTestId("audit-workspace")).toHaveText(
      `Deleted workspace ${trail.workspaceId}`,
    );
    await expect(page.getByTestId("audit-newer")).toHaveCount(0);

    await page.getByTestId("audit-older").click();
    await expect(page).toHaveURL(/&before=\d+-\d+$/);
    await expect(entries(page)).toHaveCount(trail.byOwner + trail.bySquint - 50);
    await expect(page.getByTestId("audit-older")).toHaveCount(0);
    await expect(entries(page).first().getByTestId("audit-actor")).toHaveText(E2E_COMPANY.email);
    // A page is a link: reloading it shows the same entries.
    await page.reload();
    await expect(entries(page)).toHaveCount(trail.byOwner + trail.bySquint - 50);

    await page.getByTestId("audit-newer").click();
    await expect(page).toHaveURL(/&after=\d+-\d+$/);
    await expect(entries(page)).toHaveCount(50);
    await expect(entries(page).first()).toHaveAttribute("data-action", "project.deleted");

    // Filters start over from the newest page, and combine.
    await pickFilter(page, "actor", "Squint (automatic)");
    await expect(page).toHaveURL(new RegExp(`\\?workspace=${trail.workspaceId}&actor=squint$`));
    await expect(entries(page)).toHaveCount(1);
    await expectAccessible(page);
    await pickFilter(page, "action", "Workspace settings changed");
    await expect(page.getByText("No entries match")).toBeVisible();
    await page.getByTestId("audit-clear").click();
    await expect(page).toHaveURL(/\/admin\/audit$/);
    await expect(page.getByTestId("audit-clear")).toHaveCount(0);
  });

  test("reads the audit log at 375px without scrolling sideways", async ({ page, baseURL }) => {
    const trail = await seedAuditTrail(3);
    await page.setViewportSize({ width: 375, height: 812 });
    await asAdmin(page, baseURL);
    await page.goto(`/admin/audit?workspace=${trail.workspaceId}`);
    await expect(entries(page)).toHaveCount(4);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    for (const target of [
      page.getByTestId("audit-filter-workspace"),
      page.getByTestId("audit-clear"),
      page.getByTestId("admin-nav").getByRole("link", { name: "Overview" }),
    ]) {
      await expect
        .poll(async () => (await target.boundingBox())?.height)
        .toBeGreaterThanOrEqual(44);
    }
  });

  test("reaches the panel from the page with no workspace and from the account menu", async ({
    page,
    baseURL,
  }) => {
    await asAdmin(page, baseURL);
    await page.goto("/");
    await expect(page.getByTestId("no-workspace")).toBeVisible();
    await page.getByTestId("admin-panel-link").click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/account/profile");
    await page.getByTestId("account-menu").click();
    await page.getByRole("menuitem", { name: "Admin" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("goes to sign in first when signed out", async ({ page }) => {
    await page.goto("/admin/audit");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Faudit$/);
  });
});

test.describe("a company user", () => {
  test("gets a 404 for every admin page, and no way there", async ({ page }) => {
    for (const path of ["/admin", "/admin/audit", "/admin/audit?actor=squint"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    }
    await page.goto("/");
    await page.getByTestId("account-menu").click();
    await expect(page.getByRole("menuitem", { name: "Account" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Admin" })).toHaveCount(0);
  });
});
