import AxeBuilder from "@axe-core/playwright";
import type { Browser, Locator, Page } from "@playwright/test";
import { expect, test } from "./test";
import { sessionCookie, signIn, SIGNED_OUT } from "./auth-fixtures";
import { createAdminTestWorkspace, storageQuota, type AdminTestWorkspace } from "./admin-db";
import { E2E_ADMIN } from "./e2e-env";
import { browserAs, expectNoSideScroll } from "./members-fixtures";
import { shareWorkspaceProject, skipReviewGuide } from "./squint-fixtures";

/*
 * The admin panel's Workspaces page. Each test acts on workspaces made for it
 * (`createAdminTestWorkspace`), so suspending or archiving one never touches
 * what other specs use.
 */

test.use({ storageState: SIGNED_OUT });

const GB = 1024 ** 3;

/** Signs this browser in as the admin, straight through the database. */
async function asAdmin(page: Page, baseURL: string | undefined): Promise<void> {
  await page.context().addCookies([await sessionCookie(E2E_ADMIN.email, baseURL ?? "")]);
}

async function openWorkspaces(page: Page): Promise<void> {
  await page.goto("/admin/workspaces");
  await expect(page.getByTestId("admin-workspaces")).toBeVisible();
}

const row = (page: Page, workspace: AdminTestWorkspace): Locator =>
  page.locator(`[data-testid="workspace-row"][data-workspace-id="${workspace.workspaceId}"]`);

const activeRow = (page: Page, workspace: AdminTestWorkspace) =>
  page.getByTestId("workspaces-active").locator(`[data-workspace-id="${workspace.workspaceId}"]`);

const archivedRow = (page: Page, workspace: AdminTestWorkspace) =>
  page.getByTestId("workspaces-archived").locator(`[data-workspace-id="${workspace.workspaceId}"]`);

/** Picks `item` in the workspace's row menu. */
async function choose(page: Page, workspace: AdminTestWorkspace, item: string): Promise<void> {
  const target = row(page, workspace);
  await target.scrollIntoViewIfNeeded();
  await target.getByTestId("workspace-menu").click();
  await page.getByRole("menuitem", { name: item }).click();
}

const toast = (page: Page, text: string) => page.getByTestId("toast").filter({ hasText: text });

/** A signed-out browser of its own, which won't open the review guide or reach example.com. */
async function guestBrowser(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const guest = await context.newPage();
  await skipReviewGuide(guest);
  await guest.route("https://example.com/**", (route) => route.abort());
  return guest;
}

/**
 * Brings every revealing element on the page into view, a frame apart so each
 * one's reveal starts, and waits until none is still fading in, so axe reads
 * colors at full opacity. An empty list's line art keeps its faint shadow: it
 * isn't fading, and it's decorative.
 */
async function settle(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const fading = () =>
          [
            ...document.querySelectorAll<HTMLElement>(
              '#main [style*="opacity"]:not([data-testid="state-art"] *)',
            ),
          ].filter((element) => getComputedStyle(element).opacity !== "1");
        for (const element of fading()) {
          element.scrollIntoView({ block: "center" });
          await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        }
        return fading().length;
      }),
    )
    .toBe(0);
}

test("the admin edits a workspace's storage quota", async ({ page, baseURL }, testInfo) => {
  const workspace = await createAdminTestWorkspace(testInfo.project.name);
  await asAdmin(page, baseURL);
  await page.goto("/admin");
  await page.getByTestId("admin-nav").getByRole("link", { name: "Workspaces" }).click();
  await expect(page).toHaveURL(/\/admin\/workspaces$/);
  await expect(
    page.getByTestId("admin-nav").getByRole("link", { name: "Workspaces" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(activeRow(page, workspace).getByTestId("workspace-name")).toHaveText(workspace.name);
  await expect(activeRow(page, workspace).getByTestId("workspace-owner")).toContainText(
    workspace.email,
  );
  await expect(activeRow(page, workspace).getByTestId("workspace-storage")).toContainText(
    "0 B of 5 GB",
  );

  await choose(page, workspace, "Edit storage quota");
  const dialog = page.getByTestId("quota-dialog");
  const input = dialog.getByLabel("Quota in GB");
  await expect(input).toHaveValue("5");
  await input.fill("2.55");
  await input.blur();
  await expect(dialog.getByText(/with at most one decimal/)).toBeVisible();
  await input.fill("2.5");
  await dialog.getByTestId("quota-save").click();
  await expect(dialog).toBeHidden();
  await expect(toast(page, `Saved the storage quota for ${workspace.name}.`)).toBeVisible();
  await expect(row(page, workspace).getByTestId("workspace-storage")).toContainText(
    "0 B of 2.5 GB",
  );
  expect(await storageQuota(workspace.workspaceId)).toBe(2.5 * GB);
  // Focus goes back to the row's menu, where it was.
  await expect(row(page, workspace).getByTestId("workspace-menu")).toBeFocused();
});

test("the admin makes a reset link for the owner, who sets a new password with it", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const workspace = await createAdminTestWorkspace(testInfo.project.name);
  await asAdmin(page, baseURL);
  await openWorkspaces(page);
  await choose(page, workspace, "Reset owner password");
  const dialog = page.getByTestId("reset-link-dialog");
  await expect(dialog).toContainText(workspace.email);
  await dialog.getByTestId("reset-link-create").click();
  const field = dialog.getByTestId("reset-link-field");
  await expect(field).toBeFocused();
  await expect(dialog).toContainText(/Works once, until \d{2}:\d{2} UTC\./);
  const link = await field.inputValue();
  expect(link).toMatch(/\/reset\/[A-Za-z0-9_-]{43}$/);
  await dialog.getByTestId("reset-link-done").click();
  await expect(dialog).toBeHidden();

  const owner = await (await browser.newContext({ storageState: SIGNED_OUT })).newPage();
  const fresh = "a fresh owner password";
  await owner.goto(new URL(link).pathname);
  await owner.getByLabel("New password", { exact: true }).fill(fresh);
  await owner.getByLabel("New password, again").fill(fresh);
  await owner.getByRole("button", { name: "Save new password" }).click();
  await expect(owner).toHaveURL(/\/login\?reset=done$/);
  await signIn(owner, { email: workspace.email, password: fresh });
  await expect(owner).toHaveURL(/\/(\?welcome=\w+)?$/);
  // Used once: the link is spent.
  await owner.goto(new URL(link).pathname);
  await expect(owner.getByTestId("reset-again")).toBeVisible();
  await owner.context().close();
});

test("suspending stops the owner signing in and pauses the review link, until it's lifted", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const workspace = await createAdminTestWorkspace(testInfo.project.name);
  const ownerPage = await browserAs(browser, workspace, baseURL);
  const { token } = await shareWorkspaceProject(ownerPage, "Spring launch", workspace.workspaceId);
  await ownerPage.context().close();
  const guest = await guestBrowser(browser);
  expect((await guest.goto(`/s/${token}`))?.status()).toBe(200);
  await expect(guest.getByTestId("share-unavailable")).toHaveCount(0);

  await asAdmin(page, baseURL);
  await openWorkspaces(page);
  await choose(page, workspace, "Suspend");
  const confirm = page.getByRole("dialog", { name: `Suspend ${workspace.name}?` });
  await expect(confirm.getByTestId("suspend-points")).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await confirm.getByRole("button", { name: "Suspend workspace" }).click();
  await expect(confirm).toBeHidden();
  await expect(row(page, workspace)).toHaveAttribute("data-status", "suspended");
  await expect(row(page, workspace).getByTestId("workspace-status")).toHaveText("Suspended");
  // The suspended badge's amber meets AA too.
  await settle(page);
  const badge = await new AxeBuilder({ page })
    .include(`[data-workspace-id="${workspace.workspaceId}"]`)
    .analyze();
  expect(badge.violations).toEqual([]);
  await expect(toast(page, `Suspended ${workspace.name}.`)).toBeVisible();

  const owner = await (await browser.newContext({ storageState: SIGNED_OUT })).newPage();
  await owner.goto("/login");
  await signIn(owner, workspace);
  await expect(owner.getByTestId("login-error")).toHaveText(
    "Your workspace isn't available right now, so you can't sign in. Try again later.",
  );
  await expect(owner).toHaveURL(/\/login/);

  await guest.goto(`/s/${token}`);
  await expect(
    guest.getByRole("heading", { level: 1, name: "This review isn't available right now." }),
  ).toBeVisible();
  await expect(guest.getByTestId("share-unavailable")).toHaveAttribute("data-paused", "true");
  expect((await guest.request.get(`/api/s/${token}`)).status()).toBe(404);

  await choose(page, workspace, "Lift suspension");
  await expect(row(page, workspace)).toHaveAttribute("data-status", "active");
  await expect(toast(page, `Lifted the suspension of ${workspace.name}.`)).toBeVisible();

  await signIn(owner, workspace);
  await expect(owner).toHaveURL(/\/(\?welcome=\w+)?$/);
  expect((await guest.goto(`/s/${token}`))?.status()).toBe(200);
  await expect(guest.getByTestId("share-unavailable")).toHaveCount(0);
  await owner.context().close();
  await guest.context().close();
});

test("archiving moves a workspace to Archived, and Unarchive brings it back", async ({
  page,
  baseURL,
}, testInfo) => {
  const workspace = await createAdminTestWorkspace(testInfo.project.name);
  await asAdmin(page, baseURL);
  await openWorkspaces(page);
  await choose(page, workspace, "Archive");
  const confirm = page.getByRole("dialog", { name: `Archive ${workspace.name}?` });
  await confirm.getByRole("button", { name: "Archive workspace" }).click();
  await expect(confirm).toBeHidden();
  await expect(activeRow(page, workspace)).toHaveCount(0);
  await expect(archivedRow(page, workspace)).toBeVisible();
  await expect(toast(page, `Archived ${workspace.name}.`)).toBeVisible();
  // Focus follows it to Archived, onto its Unarchive.
  await expect(archivedRow(page, workspace).getByTestId("workspace-unarchive")).toBeFocused();
  // It stays archived on a fresh read.
  await page.reload();
  const unarchive = archivedRow(page, workspace).getByRole("button", {
    name: `Unarchive ${workspace.name}`,
  });
  await unarchive.scrollIntoViewIfNeeded();
  await unarchive.click();
  await expect(archivedRow(page, workspace)).toHaveCount(0);
  await expect(activeRow(page, workspace)).toBeVisible();
  await expect(toast(page, `Unarchived ${workspace.name}.`)).toBeVisible();
  await expect(activeRow(page, workspace).getByTestId("workspace-menu")).toBeFocused();
});

test("reads at 375px without scrolling sideways, and passes axe", async ({
  page,
  baseURL,
}, testInfo) => {
  const workspace = await createAdminTestWorkspace(testInfo.project.name);
  await page.setViewportSize({ width: 375, height: 812 });
  await asAdmin(page, baseURL);
  await openWorkspaces(page);
  await activeRow(page, workspace).scrollIntoViewIfNeeded();
  await expectNoSideScroll(page);
  const menu = activeRow(page, workspace).getByTestId("workspace-menu");
  await expect.poll(async () => (await menu.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await settle(page);
  const results = await new AxeBuilder({ page }).include("#main").analyze();
  expect(results.violations).toEqual([]);
});

test("passes axe on a wide screen, with a dialog open too", async ({ page, baseURL }, testInfo) => {
  const workspace = await createAdminTestWorkspace(testInfo.project.name);
  await page.setViewportSize({ width: 1280, height: 900 });
  await asAdmin(page, baseURL);
  await openWorkspaces(page);
  await settle(page);
  expect((await new AxeBuilder({ page }).include("#main").analyze()).violations).toEqual([]);
  await choose(page, workspace, "Suspend");
  const dialog = page.getByRole("dialog", { name: `Suspend ${workspace.name}?` });
  await expect(dialog).toBeVisible();
  // Once it has popped in: the dialog and everything around it at full opacity.
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        for (let node: Element | null = element; node; node = node.parentElement) {
          if (getComputedStyle(node).opacity !== "1") return false;
        }
        return true;
      }),
    )
    .toBe(true);
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual(
    [],
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(row(page, workspace)).toHaveAttribute("data-status", "active");
});

test.describe("a company user", () => {
  test("gets a 404 for the Workspaces page and every action", async ({
    browser,
    baseURL,
  }, testInfo) => {
    const workspace = await createAdminTestWorkspace(testInfo.project.name);
    const company = await browserAs(browser, workspace, baseURL);
    const response = await company.goto("/admin/workspaces");
    expect(response?.status()).toBe(404);
    await expect(company.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    const action = await company.request.put(
      `/api/admin/workspaces/${workspace.workspaceId}/suspension`,
      { data: {} },
    );
    expect(action.status()).toBe(404);
    await company.context().close();
  });
});
