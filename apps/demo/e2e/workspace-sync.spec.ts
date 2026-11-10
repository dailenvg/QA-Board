import type { Page } from "@playwright/test";
import { expect, test } from "./test";
import { endSession, sessionCookie, signIn, SIGNED_OUT } from "./auth-fixtures";
import { E2E_ADMIN, E2E_COMPANY } from "./e2e-env";
import {
  DEFAULT_FOLDER,
  mockFrameCheck,
  openFolder,
  openOverview,
  samplePng,
  seedWorkspace,
  openNewTopLevelFolder,
} from "./squint-fixtures";
import { WORKSPACE_SEED } from "./workspace-seed";

/** Renames the open folder from its page's menu. */
async function renameFolder(page: Page, name: string): Promise<void> {
  await page.getByTestId("folder-menu").click();
  await page.getByRole("menuitem", { name: "Rename folder" }).click();
  const dialog = page.getByRole("dialog", { name: "Rename folder" });
  await dialog.getByLabel("Folder name").fill(name);
  await dialog.getByRole("button", { name: "Save" }).click();
}

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
  await other.goto("/folders");
  // In the sidebar's tree: with no projects yet, Folders shows the welcome's guide instead of cards.
  await expect(other.getByText(DEFAULT_FOLDER.name).first()).toBeVisible();

  await openNewTopLevelFolder(page);
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
  await empty.getByRole("button", { name: "Account menu" }).click();
  await expect(empty.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
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

test("after the session ends, signing in again brings back a working workspace", async ({
  browser,
  baseURL,
}) => {
  // A session of its own: the one every spec shares has to outlive this test.
  const cookie = await sessionCookie(E2E_COMPANY.email, baseURL ?? "");
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  await context.addCookies([cookie]);
  const page = await context.newPage();
  await openFolder(page);

  await endSession(cookie.value);
  await renameFolder(page, "Too late");
  const error = page.getByTestId("workspace-error");
  await expect(error).toHaveAttribute("data-reason", "signed-out");

  await page.getByTestId("workspace-sign-in").click();
  await expect(page).toHaveURL(/\/login\?next=%2Ff%2Fdefault$/);
  await signIn(page, E2E_COMPANY);
  await expect(page).toHaveURL(/\/f\/default/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(DEFAULT_FOLDER.name);

  // Working again: a change saves, and a reload reads it back (once it's saved: a reload
  // sent with the save still on its way can read the folder before it).
  const saved = page.waitForResponse(
    (response) => response.request().method() === "PATCH" && response.url().includes("/folders/"),
  );
  await renameFolder(page, "Back again");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Back again");
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Back again");
  await context.close();
});

test("pages arrive rendered from the server and hydrate without a mismatch", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await seedWorkspace(page, WORKSPACE_SEED, "/sandbox");

  // What the server sends already holds the content, not a skeleton waiting for it.
  const pages: Array<[string, string]> = [
    ["/", 'data-testid="overview-bento"'],
    ["/folders", 'data-testid="folder-card"'],
    [`/f/${DEFAULT_FOLDER.id}`, 'data-testid="project-card"'],
    ["/p/combined", 'data-testid="mode-comment"'],
  ];
  for (const [path, marker] of pages) {
    const html = await (await page.request.get(path)).text();
    expect(html, path).toContain(marker);
    await page.goto(path);
    await expect(page.locator(`[${marker}]`).first()).toBeVisible();
  }
  expect(errors.filter((text) => /hydrat|#418|#423|#425/i.test(text))).toEqual([]);
});

test("live-frame pins stay on the screenshot's page after a reload", async ({ page }) => {
  await mockFrameCheck(page, {
    verdict: "blocked",
    reason: "x-frame-options",
    finalUrl: "https://blocked.example/",
  });
  await seedWorkspace(
    page,
    {
      version: 3,
      folders: [{ ...DEFAULT_FOLDER, createdAt: 0, parentId: null }],
      projects: [
        {
          id: "site",
          folderId: DEFAULT_FOLDER.id,
          name: "Blocked site",
          source: { kind: "url", url: "https://blocked.example/" },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      // Placed on the live frame, before snapshots.
      comments: [
        {
          id: "c1",
          projectId: "site",
          x: 12.5,
          y: 40,
          body: "Tighten the hero copy.",
          author: "Ana",
          status: "active",
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      snapshots: [],
      authorName: "Ana",
    },
    "/p/site",
  );
  await page
    .getByTestId("frame-fallback")
    .getByTestId("screenshot-input")
    .setInputFiles({
      name: "blocked-home.png",
      mimeType: "image/png",
      buffer: await samplePng(page, "Screenshot"),
    });
  const image = page.getByRole("img", { name: /Blocked site, the image under review/ });
  await expect(image).toBeVisible();
  const pin = page.getByRole("button", { name: "Comment 1 by Ana", exact: true });
  await expect(pin).toBeVisible();

  await page.reload();
  await expect(image).toBeVisible();
  await expect(pin).toBeVisible();
});
