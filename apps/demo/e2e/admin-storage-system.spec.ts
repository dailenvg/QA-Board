import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./test";
import { sessionCookie, SIGNED_OUT } from "./auth-fixtures";
import { blobRowExists, seedFailedCronRun, seedOrphanRow, seedStoredWorkspace } from "./admin-db";
import { E2E_ADMIN, E2E_AUTH_SECRET } from "./e2e-env";
import { expectNoSideScroll } from "./members-fixtures";

/*
 * The admin panel's Storage and System pages. Run sweep runs the real daily
 * cleanup against the e2e database: it only deletes what's due, and every
 * spec seeds its own data, so nothing another spec needs is due.
 */

const GB = 1024 ** 3;

/** Signs this browser in as the admin, straight through the database. */
async function asAdmin(page: Page, baseURL: string | undefined): Promise<void> {
  await page.context().addCookies([await sessionCookie(E2E_ADMIN.email, baseURL ?? "")]);
}

const nav = (page: Page) => page.getByTestId("admin-nav");

/** Opens `section` from the admin nav, and checks the nav shows it's open. */
async function openSection(page: Page, section: "Storage" | "System"): Promise<void> {
  await nav(page).getByRole("link", { name: section }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/${section.toLowerCase()}$`));
  await expect(nav(page).getByRole("link", { name: section })).toHaveAttribute(
    "aria-current",
    "page",
  );
}

/**
 * Brings every revealing element into view, a frame apart so each one's
 * reveal starts, and waits until none is still fading in, so axe reads
 * colors at full opacity. Line art keeps its faint shadow: it's decorative.
 */
async function settle(page: Page, root: string): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async (scope) => {
        const fading = () =>
          [
            ...document.querySelectorAll<HTMLElement>(
              `:is(${scope}, ${scope} *)[style*="opacity"]:not([data-testid="state-art"] *)`,
            ),
          ].filter((element) => getComputedStyle(element).opacity !== "1");
        for (const element of fading()) {
          element.scrollIntoView({ block: "center" });
          await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        }
        return fading().length;
      }, root),
    )
    .toBe(0);
}

async function expectAccessible(page: Page, root = "#main"): Promise<void> {
  await settle(page, root);
  const results = await new AxeBuilder({ page }).include(root).analyze();
  expect(results.violations).toEqual([]);
}

async function expectTouchTarget(target: Locator): Promise<void> {
  await expect.poll(async () => (await target.boundingBox())?.height).toBeGreaterThanOrEqual(44);
}

test.describe("the admin", () => {
  test.use({ storageState: SIGNED_OUT });

  test("sees what Squint stores, and checks for orphans only when asked", async ({
    page,
    baseURL,
  }, testInfo) => {
    const stored = await seedStoredWorkspace(testInfo.project.name, 4.5 * GB);
    const orphan = await seedOrphanRow(stored.workspaceId);
    await asAdmin(page, baseURL);
    await page.goto("/admin");
    await openSection(page, "Storage");

    await expect(page.getByTestId("storage-total-value")).toHaveText(
      /^\d+(\.\d)? (B|KB|MB|GB|TB)$/,
    );
    await expect(page.getByTestId("sweep-tile")).toContainText("Runs daily at 04:00 UTC.");
    const workspace = page.getByTestId("storage-workspace").filter({ hasText: stored.name });
    await expect(workspace).toContainText(stored.email);
    await expect(workspace.getByTestId("workspace-storage")).toContainText("4.5 GB of 5 GB");
    const project = page.getByTestId("storage-project").filter({ hasText: stored.projectName });
    await expect(project).toContainText(`in ${stored.name}`);
    await expect(project.getByTestId("storage-project-bytes")).toHaveText("4.5 GB");
    await expect(project).toContainText("1 file");

    // Nothing is listed in Vercel Blob until the admin asks.
    const card = page.getByTestId("orphan-card");
    await expect(card).toContainText("Not checked yet");
    await expect(card.getByTestId("orphan-report")).toHaveCount(0);
    await card.getByTestId("orphan-check").click();
    const report = card.getByTestId("orphan-report");
    await expect(report).toHaveAttribute("data-complete", "true");
    await expect(report.getByTestId("orphan-shareFiles")).toContainText("Not in Vercel Blob here");
    await expect(report.getByTestId("orphan-workspaceRows")).toContainText(/\d+ files?, \d/);
    await expect(report.getByTestId("orphan-unrecordedFiles")).toContainText(
      "Not in Vercel Blob here",
    );
    await expect(report).toContainText(/Checked \w{3} \d{1,2}, \d{4}, \d{2}:\d{2} UTC/);
    await expect(card.getByTestId("orphan-check")).toHaveText("Check again");
    // Checking deleted nothing.
    expect(await blobRowExists(stored.workspaceId, orphan)).toBe(true);
    await expectAccessible(page);
  });

  test("runs the sweep after seeing what it would delete, then sees what it did", async ({
    page,
    baseURL,
  }, testInfo) => {
    const stored = await seedStoredWorkspace(testInfo.project.name, 1024);
    const orphan = await seedOrphanRow(stored.workspaceId);
    await asAdmin(page, baseURL);
    await page.goto("/admin/storage");

    await page.getByTestId("sweep-run").click();
    const dialog = page.getByTestId("sweep-dialog");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    // The dry run's counts, as it opens.
    await expect(dialog.getByTestId("orphan-workspaceRows")).toContainText(/\d+ files?, \d/);
    await expectAccessible(page, '[data-testid="sweep-dialog"]');

    await dialog.getByTestId("sweep-confirm").click();
    const result = dialog.getByTestId("sweep-result");
    await expect(result).toBeVisible({ timeout: 60_000 });
    await expect(result.getByTestId("sweep-outcome")).toHaveText("The cleanup finished.");
    await expect(
      result.getByTestId("sweep-step").filter({ hasText: "Workspace files with no record" }),
    ).toHaveText(/Workspace files with no record\s*\d+/);
    await expect(dialog.getByTestId("sweep-done")).toBeFocused();
    expect(await blobRowExists(stored.workspaceId, orphan)).toBe(false);
    await expectAccessible(page, '[data-testid="sweep-dialog"]');

    await dialog.getByTestId("sweep-done").click();
    await expect(dialog).toBeHidden();
    // The page read the server again: the run just made is the last one.
    await expect(page.getByTestId("sweep-last-run")).toContainText(/: Finished$/);
    await expect(page.getByTestId("orphan-card")).toContainText("Not checked yet");

    await openSection(page, "System");
    const latest = page.getByTestId("cron-run").first();
    await expect(latest.getByTestId("cron-run-trigger")).toHaveText("Admin");
    await expect(latest.getByTestId("cron-run-status")).toHaveText("Finished");

    await page.goto("/admin/audit?action=admin.sweep_run");
    const entry = page.getByTestId("audit-entry").first();
    await expect(entry).toHaveAttribute("data-action", "admin.sweep_run");
    await expect(entry).toContainText("Ran daily cleanup");
    await expect(entry.getByTestId("audit-actor")).toContainText(E2E_ADMIN.email);
  });

  test("sees which services are set up, the cleanup's runs and every rate limit", async ({
    page,
    baseURL,
  }) => {
    await seedFailedCronRun(["shares", "pins"], 5);
    await asAdmin(page, baseURL);
    await page.goto("/admin");
    await openSection(page, "System");

    const services = page.getByTestId("system-services");
    await expect(services.getByTestId("service-database").getByTestId("service-status")).toHaveText(
      "Configured",
    );
    await expect(
      services.getByTestId("service-authSecret").getByTestId("service-status"),
    ).toHaveText("Configured");
    // The e2e server keeps files in Postgres and sends no email.
    for (const id of ["blob", "resendKey", "emailFrom"]) {
      await expect(services.getByTestId(`service-${id}`).getByTestId("service-status")).toHaveText(
        "Not configured",
      );
    }
    // Never a value.
    await expect(page.locator("#main")).not.toContainText(E2E_AUTH_SECRET);
    await expect(page.locator("#main")).not.toContainText("postgres://");

    const failedRun = page
      .getByTestId("cron-run")
      .filter({ has: page.getByTestId("cron-run-failed-steps") })
      .first();
    await expect(failedRun.getByTestId("cron-run-trigger")).toHaveText("Schedule");
    await expect(failedRun.getByTestId("cron-run-status")).toHaveText("Failed steps");
    await expect(failedRun.getByTestId("cron-run-failed-steps")).toHaveText(
      "Expired review links, pinpoint pins past 30 days",
    );
    await expect(failedRun).toContainText("3 s");

    const postgres = page.getByTestId("rate-limits-postgres");
    await expect(
      postgres.getByTestId("rate-limit").filter({ hasText: "5 per 15 minutes, per email address" }),
    ).toContainText("Failed sign-ins");
    // In memory, as this server sets it (PINPOINT_RATE_LIMIT=1000 on the e2e server).
    const memory = page.getByTestId("rate-limits-memory");
    await expect(
      memory.getByTestId("rate-limit").filter({ hasText: "Pinpoint widget pins" }),
    ).toContainText("1,000 per minute, per IP address");
    await expectAccessible(page);
  });

  test("reads both pages at 375px without scrolling sideways", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await asAdmin(page, baseURL);
    await page.goto("/admin/storage");
    await expect(page.getByTestId("admin-storage")).toBeVisible();
    await expectNoSideScroll(page);
    await expectTouchTarget(page.getByTestId("sweep-run"));
    await expectTouchTarget(page.getByTestId("orphan-check"));
    await page.goto("/admin/system");
    await expect(page.getByTestId("admin-system")).toBeVisible();
    await settle(page, "#main");
    await expectNoSideScroll(page);
  });
});

test.describe("a company user", () => {
  test("gets a 404 for the Storage and System pages and their actions", async ({
    page,
    baseURL,
  }) => {
    for (const path of ["/admin/storage", "/admin/system"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    }
    for (const path of ["/api/admin/storage/orphans", "/api/admin/sweep"]) {
      const response = await page.request.post(`${baseURL}${path}`, {
        data: {},
        headers: { origin: baseURL ?? "" },
      });
      expect(response.status()).toBe(404);
    }
  });
});
