import AxeBuilder from "@axe-core/playwright";
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./test";
import { sessionCookie, signIn, SIGNED_OUT } from "./auth-fixtures";
import {
  addDisposableMember,
  createDisposableOwner,
  nameAccount,
  type DisposableAccount,
  type MemberOptions,
} from "./account-db";
import { addDefaultFolder, DEFAULT_FOLDER } from "./squint-fixtures";

/*
 * The Members section (PR 3): the People list as the owner, a member with the
 * people switch and any other member see it, removing someone, and the
 * owner's permission switches. Every workspace here is made for the test
 * (`createDisposableOwner`), so the e2e owner's never changes.
 */

test.use({ storageState: SIGNED_OUT });

const OWNER = "Olga Owner";
const REMOVED =
  "You're no longer in a Squint workspace, so you can't sign in. Ask the person who invited you for a new invite.";

/** A browser of its own, signed in as `account`. */
async function browserAs(
  browser: Browser,
  account: { email: string },
  baseURL: string | undefined,
): Promise<Page> {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  await context.addCookies([await sessionCookie(account.email, baseURL ?? "")]);
  return context.newPage();
}

interface Team {
  owner: DisposableAccount;
  ownerPage: Page;
}

/** A workspace owned by Olga, signed in on `page`. */
async function team(page: Page, label: string, baseURL: string | undefined): Promise<Team> {
  const owner = await createDisposableOwner(label);
  await nameAccount(owner.email, OWNER);
  await page.context().addCookies([await sessionCookie(owner.email, baseURL ?? "")]);
  return { owner, ownerPage: page };
}

const member = (owner: DisposableAccount, label: string, options: MemberOptions) =>
  addDisposableMember(owner, label, options);

async function openMembers(page: Page) {
  await page.goto("/account/members");
  const card = page.getByTestId("people-card");
  await expect(card).toBeVisible();
  return card;
}

const row = (page: Page, name: string) =>
  page.getByTestId("member-row").filter({ has: page.getByTestId("member-name").getByText(name) });

test("the owner removes a member: they're signed out, and signing in says why", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const { owner } = await team(page, testInfo.project.name, baseURL);
  const ben = await member(owner, testInfo.project.name, { name: "Ben Ito" });
  await member(owner, testInfo.project.name, { name: "Cleo Park" });
  const benPage = await browserAs(browser, ben, baseURL);
  await benPage.goto("/");
  await expect(benPage).not.toHaveURL(/\/login/);

  const card = await openMembers(page);
  await expect(card.getByTestId("people-count")).toHaveText("3 people");
  await expect(row(page, OWNER)).toContainText("You");
  await expect(row(page, OWNER).getByTestId("member-menu")).toHaveCount(0);
  await expect(row(page, "Ben Ito").getByTestId("member-meta")).toContainText(ben.email);

  await page.getByRole("button", { name: "Actions for Ben Ito" }).click();
  await page.getByRole("menuitem", { name: "Remove from workspace" }).click();
  const dialog = page.getByRole("dialog", { name: `Remove Ben Ito from ${owner.workspaceName}?` });
  await expect(dialog).toContainText("Their Squint account is deleted after 24 hours.");
  // Cancel first: Enter never removes.
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Remove Ben Ito" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("toast").filter({ hasText: "Ben Ito was removed." })).toBeVisible();
  await expect(row(page, "Ben Ito")).toHaveCount(0);
  // Focus goes to the next row's menu.
  await expect(page.getByRole("button", { name: "Actions for Cleo Park" })).toBeFocused();
  await expect(card.getByTestId("people-count")).toHaveText("2 people");

  // Cleo next: no row with a menu left, so focus goes to the list's heading.
  await page.getByRole("button", { name: "Actions for Cleo Park" }).click();
  await page.getByRole("menuitem", { name: "Remove from workspace" }).click();
  await page.getByRole("button", { name: "Remove Cleo Park" }).click();
  await expect(card.getByTestId("people-count")).toHaveText("1 person");
  await expect(card.getByTestId("people-count")).toBeFocused();

  // Ben's open browser: the next navigation goes to /login, and signing in says why not.
  await benPage.goto("/");
  await expect(benPage).toHaveURL(/\/login/);
  await signIn(benPage, ben);
  await expect(benPage.getByTestId("login-error")).toHaveText(REMOVED);
  await expect(benPage.getByTestId("login-error").getByRole("link")).toHaveCount(0);
  await expect(benPage.getByLabel("Password")).toHaveValue("");
  await expect(benPage.getByRole("button", { name: "Sign in" })).toBeFocused();
  await benPage.context().close();
});

test("a member sees who's in the workspace, read-only, and what they can do", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const { owner } = await team(page, testInfo.project.name, baseURL);
  const ben = await member(owner, testInfo.project.name, {
    name: "Ben Ito",
    permissions: ["review_links", "import"],
  });
  await member(owner, testInfo.project.name, { name: "Cleo Park" });
  const benPage = await browserAs(browser, ben, baseURL);
  const card = await openMembers(benPage);
  await expect(card).toContainText(
    `Everyone in ${owner.workspaceName}. To invite someone, ask ${OWNER}.`,
  );
  await expect(card.getByTestId("member-row")).toHaveCount(3);
  await expect(card.getByTestId("member-menu")).toHaveCount(0);
  await expect(card.getByTestId("member-permissions-trigger")).toHaveCount(0);
  // Names and when they joined, never anyone's email.
  await expect(card).not.toContainText("@e2e.test");
  await expect(row(benPage, "Ben Ito")).toContainText("You");
  await expect(row(benPage, OWNER)).toContainText("Owner");

  const own = card.getByTestId("own-permissions");
  await expect(own.getByRole("heading", { name: "What you can do" })).toBeVisible();
  await expect(own.getByTestId("own-permission")).toHaveText([
    "You can manage client review links.",
    "You can't move projects to trash or restore them.",
    "You can import projects saved in your browser.",
    "You can't invite or remove people.",
  ]);
  await expect(own).toContainText(`To change any of these, ask ${OWNER}.`);
  await expect(row(benPage, "Cleo Park").getByTestId("own-permissions")).toHaveCount(0);
  await benPage.context().close();
});

test("a member with the people switch removes only members without it", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const { owner } = await team(page, testInfo.project.name, baseURL);
  const manager = await member(owner, testInfo.project.name, {
    name: "Mia Manager",
    permissions: ["people"],
  });
  await member(owner, testInfo.project.name, { name: "Pia Peer", permissions: ["people"] });
  await member(owner, testInfo.project.name, { name: "Zed Plain", permissions: ["trash"] });
  const managerPage = await browserAs(browser, manager, baseURL);
  const card = await openMembers(managerPage);
  await expect(row(managerPage, OWNER).getByTestId("member-menu")).toHaveCount(0);
  await expect(row(managerPage, "Pia Peer").getByTestId("member-menu")).toHaveCount(0);
  await expect(row(managerPage, "Mia Manager").getByTestId("member-menu")).toHaveCount(0);
  await expect(row(managerPage, "Zed Plain").getByTestId("member-menu")).toHaveCount(1);
  // Emails, as the owner sees them, but nobody's switches.
  await expect(row(managerPage, "Zed Plain")).toContainText("@e2e.test");
  await expect(card.getByTestId("member-permissions-trigger")).toHaveCount(0);
  await expect(row(managerPage, "Mia Manager").getByTestId("own-permission")).toHaveText([
    "You can copy client review links, but not change them.",
    "You can't move projects to trash or restore them.",
    "You can't import projects saved in your browser.",
    "You can invite people and remove members who don't have this permission.",
  ]);
  await managerPage.context().close();
});

test("the owner turns a switch off: it saves, and the member's stale tab is refused", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const { owner } = await team(page, testInfo.project.name, baseURL);
  const ben = await member(owner, testInfo.project.name, { name: "Ben Ito" });
  await addDefaultFolder(page, owner.workspaceId);
  const created = await page.request.post(`/api/w/${owner.workspaceId}/projects`, {
    data: {
      id: `kept-${Date.now().toString(36)}`,
      folderId: DEFAULT_FOLDER.id,
      name: "Launch page",
      source: { kind: "url", url: "https://example.com/" },
    },
  });
  expect(created.status()).toBe(201);

  const benPage = await browserAs(browser, ben, baseURL);
  await benPage.goto(`/f/${DEFAULT_FOLDER.id}`);
  const card = benPage.getByTestId("project-card").filter({ hasText: "Launch page" });
  await card.getByTestId("project-menu").click();
  await expect(benPage.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  await benPage.keyboard.press("Escape");

  await openMembers(page);
  const trigger = row(page, "Ben Ito").getByTestId("member-permissions-trigger");
  await expect(trigger).toHaveText("Permissions: Review links, trash, import");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const trash = page.getByRole("switch", { name: "Move projects to trash for Ben Ito" });
  await expect(trash).toHaveAttribute("aria-checked", "true");
  // Held a moment on its way, so "Saving…" can be seen.
  await page.route("**/api/account/members/*/permissions", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue();
  });
  await trash.click();
  const status = page.getByTestId("permission-trash").getByRole("status");
  await expect(status).toHaveText("Saving…");
  await expect(trash).toHaveAttribute("aria-checked", "true");
  await expect(trash).toHaveAttribute("aria-disabled", "true");
  await expect(status).toHaveText("Saved.");
  await expect(trash).toHaveAttribute("aria-checked", "false");
  await expect(trash).toBeFocused();
  await expect(trigger).toHaveText("Permissions: Review links, import");
  await expect(status).toHaveText("", { timeout: 5000 });

  // Ben's tab still shows Delete; the server refuses it, and the project stays.
  await card.getByTestId("project-menu").click();
  await benPage.getByRole("menuitem", { name: "Delete" }).click();
  await benPage
    .getByRole("dialog", { name: "Delete Launch page?" })
    .getByRole("button", { name: "Delete project" })
    .click();
  await expect(
    benPage.getByTestId("toast").filter({
      hasText: `You can no longer move projects to trash or restore them. Ask ${OWNER} if you need to.`,
    }),
  ).toBeVisible();
  await expect(card).toBeVisible();
  // Once it has refreshed, Delete is gone.
  await benPage.reload();
  await card.getByTestId("project-menu").click();
  await expect(benPage.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect(benPage.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
  await benPage.context().close();
});

test("a switch that can't save stays where it was and says why", async ({
  page,
  baseURL,
}, testInfo) => {
  const { owner } = await team(page, testInfo.project.name, baseURL);
  await member(owner, testInfo.project.name, { name: "Ben Ito" });
  await openMembers(page);
  await row(page, "Ben Ito").getByTestId("member-permissions-trigger").click();
  await page.route("**/api/account/members/*/permissions", (route) => route.abort());
  const people = page.getByRole("switch", { name: "Invite and remove people for Ben Ito" });
  await people.click();
  await expect(page.getByTestId("permission-people").getByRole("alert")).toHaveText(
    "Couldn't save this change. Check your connection and try again.",
  );
  await expect(people).toHaveAttribute("aria-checked", "false");
  await expect(people).not.toHaveAttribute("aria-disabled");
  await expect(people).toBeFocused();
});

test("one Permissions panel open at a time, Escape closes it, and names never repeat", async ({
  page,
  baseURL,
}, testInfo) => {
  const { owner } = await team(page, testInfo.project.name, baseURL);
  await member(owner, testInfo.project.name, { name: "Ben Ito" });
  await member(owner, testInfo.project.name, { name: "Cleo Park" });
  await openMembers(page);
  const benTrigger = row(page, "Ben Ito").getByTestId("member-permissions-trigger");
  const cleoTrigger = row(page, "Cleo Park").getByTestId("member-permissions-trigger");
  await benTrigger.click();
  await cleoTrigger.click();
  await expect(benTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("member-permissions")).toHaveCount(1);
  await expect(page.getByRole("switch", { name: /for Cleo Park$/ })).toHaveCount(4);
  await expect(page.getByRole("switch", { name: /for Ben Ito$/ })).toHaveCount(0);
  const results = await new AxeBuilder({ page }).include("[data-testid=people-card]").analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole("switch", { name: "Import local data for Cleo Park" }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("member-permissions")).toHaveCount(0);
  await expect(cleoTrigger).toBeFocused();
});

test("at 375px a member's open Permissions panel fits without scrolling sideways", async ({
  page,
  baseURL,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const { owner } = await team(page, testInfo.project.name, baseURL);
  await member(owner, testInfo.project.name, { name: "Bartholomew Longname-Ito" });
  await openMembers(page);
  await row(page, "Bartholomew Longname-Ito").getByTestId("member-permissions-trigger").click();
  await expect(page.getByTestId("member-permissions")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // Polled: the panel pops in from a little smaller, and a box mid-animation is scaled.
  for (const control of await page.getByRole("switch").all()) {
    await expect.poll(async () => (await control.boundingBox())?.width).toBeGreaterThanOrEqual(44);
    await expect.poll(async () => (await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
});

test("an owner with members is sent to Members instead of the delete dialog", async ({
  page,
  baseURL,
}, testInfo) => {
  const { owner } = await team(page, testInfo.project.name, baseURL);
  await member(owner, testInfo.project.name, { name: "Ben Ito" });
  await page.goto("/account/profile");
  const card = page.getByTestId("delete-account-settings");
  await expect(card).toContainText(
    `Other people still work in ${owner.workspaceName}. Remove them in Members, then you can delete your account and the workspace.`,
  );
  await expect(card.getByRole("button", { name: "Delete account" })).toHaveCount(0);
  await card.getByRole("link", { name: "Go to Members" }).click();
  await expect(page).toHaveURL(/\/account\/members$/);
  await expect(
    page
      .getByRole("navigation", { name: "Account settings" })
      .getByRole("link", { name: "Members" }),
  ).toHaveAttribute("aria-current", "page");
});

test("a member's Delete account card names the workspace they'd leave", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const { owner } = await team(page, testInfo.project.name, baseURL);
  const ben = await member(owner, testInfo.project.name, { name: "Ben Ito" });
  const benPage = await browserAs(browser, ben, baseURL);
  await benPage.goto("/account/profile");
  await expect(benPage.getByTestId("delete-account-settings")).toContainText(
    `removes you from ${owner.workspaceName}`,
  );
  await benPage.getByTestId("delete-account").click();
  await expect(benPage.getByRole("dialog", { name: "Delete your account?" })).toContainText(
    `You'll leave ${owner.workspaceName}, be signed out everywhere`,
  );
  await benPage.context().close();
});
