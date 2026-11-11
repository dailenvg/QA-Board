import type { Page } from "@playwright/test";
import { expect, test } from "./test";
import { sessionCookie, signIn, SIGNED_OUT } from "./auth-fixtures";
import {
  addDisposableMember,
  createDisposableOwner,
  deletionDates,
  type DisposableAccount,
} from "./account-db";
import { E2E_ADMIN } from "./e2e-env";
import { shareWorkspaceProject } from "./squint-fixtures";

/*
 * Every account deleted here is made for the test (`createDisposableOwner`):
 * the e2e owner, the spare and the admin are never deleted.
 */

test.use({ storageState: SIGNED_OUT });

async function signInAs(page: Page, account: { email: string }, baseURL: string | undefined) {
  await page.context().addCookies([await sessionCookie(account.email, baseURL ?? "")]);
}

async function openDeleteDialog(page: Page) {
  await page.goto("/account/profile");
  await page
    .getByTestId("delete-account-settings")
    .getByRole("button", {
      name: "Delete account",
    })
    .click();
  const dialog = page.getByRole("dialog", { name: "Delete your account?" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function expectDeleted(page: Page, account: DisposableAccount) {
  await expect(page).toHaveURL(/\/login\?account=deleted$/);
  await expect(page.getByTestId("login-notice")).toHaveText(
    "Your account is scheduled for deletion, and you're signed out on every device. Your Squint admin can restore it within 30 days.",
  );
  await signIn(page, account);
  await expect(page.getByTestId("login-error")).toContainText("Invalid email or password.");
}

test("an owner deletes their account and workspace, and its review link stops working", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const owner = await createDisposableOwner(testInfo.project.name);
  await signInAs(page, owner, baseURL);
  const { token } = await shareWorkspaceProject(page, "Launch page", owner.workspaceId);

  await page.goto("/account/profile");
  await expect(page.getByTestId("delete-account-settings")).toContainText(
    `the ${owner.workspaceName} workspace`,
  );
  const dialog = await openDeleteDialog(page);
  const confirm = dialog.getByLabel(`Type ${owner.workspaceName} to confirm`);
  const password = dialog.getByLabel("Current password");
  const submit = dialog.getByRole("button", { name: "Delete account" });

  // Nothing typed yet: the button reads as unavailable, and submitting says what's missing.
  await expect(submit).toHaveAttribute("aria-disabled", "true");
  await password.press("Enter");
  await expect(
    dialog.getByText(`Type ${owner.workspaceName} to confirm.`, { exact: true }),
  ).toBeVisible();
  await expect(confirm).toBeFocused();

  await confirm.fill(owner.workspaceName.toUpperCase());
  await confirm.blur();
  await expect(
    dialog.getByText(`That doesn't match. Type ${owner.workspaceName} to confirm.`),
  ).toBeVisible();

  await confirm.fill(owner.workspaceName);
  await password.fill("not the password");
  await expect(submit).not.toHaveAttribute("aria-disabled");
  await submit.click();
  await expect(
    dialog.getByText("That isn't your current password. Check it and try again."),
  ).toBeVisible();
  await expect(password).toBeFocused();
  expect(await deletionDates(owner.email, owner.workspaceId)).toEqual({
    user: null,
    workspace: null,
  });

  await password.fill(owner.password);
  await submit.click();
  await expectDeleted(page, owner);
  const dates = await deletionDates(owner.email, owner.workspaceId);
  expect(dates.user).not.toBeNull();
  expect(dates.workspace).toEqual(dates.user);

  const guestContext = await browser.newContext({ storageState: SIGNED_OUT });
  const guest = await guestContext.newPage();
  await guest.goto(`/s/${token}`);
  await expect(guest.getByTestId("share-unavailable")).toBeVisible();
  expect((await guest.request.get(`/api/s/${token}`)).status()).toBe(404);
  await guestContext.close();
});

test("Escape closes the dialog and nothing is deleted", async ({ page, baseURL }, testInfo) => {
  const owner = await createDisposableOwner(testInfo.project.name);
  await signInAs(page, owner, baseURL);
  const dialog = await openDeleteDialog(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByTestId("delete-account-settings").getByRole("button", { name: "Delete account" }),
  ).toBeFocused();
  expect(await deletionDates(owner.email, owner.workspaceId)).toEqual({
    user: null,
    workspace: null,
  });
});

test("a member types their email, and the workspace stays open for its owner", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const owner = await createDisposableOwner(testInfo.project.name);
  const member = await addDisposableMember(owner, testInfo.project.name);
  await signInAs(page, member, baseURL);

  const dialog = await openDeleteDialog(page);
  await dialog.getByLabel(`Type ${member.email} to confirm`).fill(member.email.toUpperCase());
  await dialog.getByLabel("Current password").fill(member.password);
  await dialog.getByRole("button", { name: "Delete account" }).click();
  await expectDeleted(page, member);
  expect(await deletionDates(member.email, owner.workspaceId)).toMatchObject({ workspace: null });

  const ownerContext = await browser.newContext({ storageState: SIGNED_OUT });
  const ownerPage = await ownerContext.newPage();
  await signInAs(ownerPage, owner, baseURL);
  await ownerPage.goto("/account/workspace");
  await expect(ownerPage).toHaveURL(/\/account\/workspace$/);
  await ownerContext.close();
});

test("the admin has no Delete account card, and the route refuses them", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, E2E_ADMIN, baseURL);
  await page.goto("/account/profile");
  await expect(page.getByRole("button", { name: "Log out everywhere" })).toBeVisible();
  await expect(page.getByTestId("delete-account-settings")).toHaveCount(0);
  const response = await page.request.delete("/api/account", {
    data: { confirmText: "anything", currentPassword: E2E_ADMIN.password },
  });
  expect(response.status()).toBe(403);
  expect(await response.json()).toEqual({ error: "admin-account" });
});
