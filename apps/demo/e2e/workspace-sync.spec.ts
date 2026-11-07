import type { Page } from "@playwright/test";
import { expect, test } from "./test";
import { sessionCookie, SIGNED_OUT } from "./auth-fixtures";
import { E2E_ADMIN } from "./e2e-env";
import { DEFAULT_FOLDER, openFolder, openOverview } from "./squint-fixtures";

/** The tab comes back into view: the workspace is read from the server again. */
async function refocus(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

test("the workspace lives on the server: another tab and a reload see the same folders", async ({
  page,
  context,
}) => {
  await openFolder(page);
  const other = await context.newPage();
  await other.goto("/");
  // In the sidebar's tree: with no projects yet, the Overview shows its welcome instead of cards.
  await expect(other.getByText(DEFAULT_FOLDER.name).first()).toBeVisible();

  await page.getByTestId("new-folder").first().click();
  const dialog = page.getByRole("dialog", { name: "New folder" });
  await dialog.getByLabel("Folder name").fill("From tab one");
  await dialog.getByRole("button", { name: "Create folder" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("From tab one");

  // The other tab hears of it (BroadcastChannel), and a reload reads it back from the server.
  await expect(other.getByText("From tab one").first()).toBeVisible();
  await other.reload();
  await expect(other.getByText("From tab one").first()).toBeVisible();
  // Nothing of it is kept in this browser.
  expect(await page.evaluate(() => localStorage.getItem("squint:v3"))).toBeNull();
});

test("a change the server refuses is rolled back, saying it was deleted elsewhere", async ({
  page,
}) => {
  await openFolder(page);
  await page.route("**/api/w/*/folders/*", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 404, json: { error: "not-found" } })
      : route.fallback(),
  );
  await page.getByTestId("folder-menu").click();
  await page.getByRole("menuitem", { name: "Rename folder" }).click();
  const dialog = page.getByRole("dialog", { name: "Rename folder" });
  await dialog.getByLabel("Folder name").fill("Renamed");
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(
    page.getByTestId("toast").filter({ hasText: "deleted in another tab" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(DEFAULT_FOLDER.name);
});

test("an ended session shows a way to sign in again", async ({ page }) => {
  await openOverview(page);
  await page.route("**/api/w/*/snapshot", (route) =>
    route.fulfill({ status: 401, json: { error: "unauthenticated" } }),
  );
  await refocus(page);
  const error = page.getByTestId("workspace-error");
  await expect(error).toHaveAttribute("data-reason", "signed-out");
  await expect(error.getByRole("heading", { level: 1 })).toHaveText("You've been signed out");
  await expect(page.getByTestId("workspace-sign-in")).toHaveAttribute("href", "/login");
});

test("an account in no workspace sees an empty state, not an error", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  await context.addCookies([await sessionCookie(E2E_ADMIN.email, baseURL ?? "")]);
  const page = await context.newPage();
  await page.goto("/");
  const empty = page.getByTestId("no-workspace");
  await expect(empty.getByRole("heading", { level: 1 })).toHaveText("No workspace yet");
  await expect(empty.getByRole("button", { name: "Sign out" })).toBeVisible();
  // A project link shows the same, never another workspace's project.
  await page.goto("/p/anything");
  await expect(page.getByTestId("no-workspace")).toBeVisible();
  await context.close();
});

test("share links can only be created signed in", async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL, storageState: SIGNED_OUT });
  const response = await anonymous.post("/api/shares", {
    data: {
      project: { name: "X", source: { kind: "url", url: "https://example.com/" }, createdAt: 0 },
      snapshots: [],
      comments: [],
    },
  });
  expect(response.status()).toBe(401);
  await anonymous.dispose();
});
