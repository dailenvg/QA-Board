import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./test";
import { sessionCookie, signIn, SIGNED_OUT } from "./auth-fixtures";
import {
  createEmailChangeLink,
  emailChangeUnused,
  resetSpareAccount,
  spareSessions,
} from "./account-db";
import { E2E_ADMIN, E2E_SPARE } from "./e2e-env";

const NEW_PASSWORD = "a new spare password";

/** A browser of its own, signed in as the spare account. */
async function spareBrowser(browser: Browser, baseURL: string | undefined): Promise<Page> {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  await context.addCookies([await sessionCookie(E2E_SPARE.email, baseURL ?? "")]);
  return context.newPage();
}

test.describe("as the e2e owner", () => {
  test("/account opens the profile, and a name is checked on blur and saved", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/account\/profile$/);
    await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
    await expect(page.getByTestId("account-summary")).toHaveText(
      "Your profile, how you sign in, your workspace and its storage.",
    );
    const sidebar = page.getByRole("complementary", { name: "Workspace" });
    await sidebar.getByTestId("account-menu").click();
    await expect(sidebar.getByRole("menuitem", { name: "Account" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.keyboard.press("Escape");
    await expect(sidebar.getByTestId("account-menu")).toBeFocused();
    const section = page.getByRole("navigation", { name: "Account settings" });
    await expect(section.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const card = page.getByTestId("name-settings");
    const name = card.getByLabel("Name");
    await name.fill("x".repeat(81));
    await name.blur();
    await expect(card.getByText("Use at most 80 characters.")).toBeVisible();
    await expect(name).toHaveAttribute("aria-invalid", "true");

    await name.fill("  Ana Lima ");
    await expect(name).not.toHaveAttribute("aria-invalid");
    await card.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByTestId("name-saved")).toHaveText("Name saved.");
    await expect(name).toHaveValue("Ana Lima");
    await page.reload();
    await expect(page.getByTestId("name-settings").getByLabel("Name")).toHaveValue("Ana Lima");
  });
});

test.describe("as the spare account", () => {
  test.use({ storageState: SIGNED_OUT });

  test.beforeEach(async ({ page, baseURL }) => {
    await resetSpareAccount();
    await page.context().addCookies([await sessionCookie(E2E_SPARE.email, baseURL ?? "")]);
  });

  test("a wrong current password shows an inline error on that field", async ({ page }) => {
    await page.goto("/account/profile");
    const card = page.getByTestId("password-settings");
    await card.getByLabel("Current password").fill("not the password");
    await card.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await card.getByLabel("New password, again").fill(NEW_PASSWORD);
    await card.getByRole("button", { name: "Change password" }).click();
    const current = card.getByLabel("Current password");
    await expect(
      card.getByText("That isn't your current password. Check it and try again."),
    ).toBeVisible();
    await expect(current).toHaveAttribute("aria-invalid", "true");
    await expect(current).toBeFocused();
    await expect(page.getByTestId("password-saved")).toBeEmpty();
  });

  test("changing the password keeps this browser signed in and signs out another", async ({
    page,
    browser,
    baseURL,
  }) => {
    const other = await spareBrowser(browser, baseURL);
    await other.goto("/account/profile");
    await expect(other.getByTestId("profile-settings")).toBeVisible();

    await page.goto("/account/profile");
    const card = page.getByTestId("password-settings");
    await card.getByLabel("Current password").fill(E2E_SPARE.password);
    await card.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await card.getByLabel("New password, again").fill(NEW_PASSWORD);
    await card.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByTestId("password-saved")).toHaveText(
      "Password changed. Your other devices are signed out.",
    );
    await expect(card.getByLabel("Current password")).toHaveValue("");

    await page.reload();
    await expect(page).toHaveURL(/\/account\/profile$/);
    await other.reload();
    await expect(other).toHaveURL(/\/login\?next=%2Faccount%2Fprofile$/);
    await signIn(other, { email: E2E_SPARE.email, password: NEW_PASSWORD });
    await expect(other).toHaveURL(/\/account\/profile$/);
    await other.context().close();
  });

  test("an email change is confirmed by a POST from its link, then you sign in with the new address", async ({
    page,
    browser,
    baseURL,
  }, testInfo) => {
    const newEmail = `spare-${testInfo.project.name}@e2e.test`;
    await page.goto("/account/profile");
    const card = page.getByTestId("email-settings");
    await card.getByLabel("New email").fill(newEmail);
    await card.getByLabel("Current password").fill(E2E_SPARE.password);
    await card.getByRole("button", { name: "Send confirmation link" }).click();
    await expect(page.getByTestId("email-sent")).toContainText(
      `If no other account uses ${newEmail}, a link to confirm the change is on its way there.`,
    );
    await expect(card).toContainText(`You sign in with ${E2E_SPARE.email}.`);

    // The mailed token is stored hashed only, so the spec writes a link of its own.
    const link = await createEmailChangeLink(newEmail);
    const guest = await browser.newContext({ storageState: SIGNED_OUT });
    const inbox = await guest.newPage();
    const opened = await inbox.goto(link);
    expect(opened?.headers()["referrer-policy"]).toBe("same-origin");
    await expect(
      inbox.getByRole("heading", { level: 1, name: "Confirm your new email" }),
    ).toBeVisible();
    // Opening the link, as a mail scanner would, changes nothing.
    expect(await emailChangeUnused(link)).toBe(true);
    await inbox.getByRole("button", { name: "Confirm new email" }).click();
    await expect(inbox).toHaveURL(/\/login\?email=changed$/);
    await expect(inbox.getByTestId("login-notice")).toHaveText(
      "Email changed. Sign in with your new email address.",
    );
    expect(await emailChangeUnused(link)).toBe(false);

    // Every session ended, the first browser's too.
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
    await signIn(inbox, { email: newEmail, password: E2E_SPARE.password });
    await expect(inbox).toHaveURL(new RegExp(`${baseURL ?? ""}/$`));
    await guest.close();
  });

  test("log out everywhere signs out every browser, this one included", async ({
    page,
    browser,
    baseURL,
  }) => {
    const other = await spareBrowser(browser, baseURL);
    await page.goto("/account/profile");
    expect(await spareSessions()).toBe(2);
    await page.getByRole("button", { name: "Log out everywhere" }).click();
    const confirm = page.getByRole("dialog", { name: "Log out everywhere?" });
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
    await confirm.getByRole("button", { name: "Log out everywhere" }).click();
    await expect(page).toHaveURL(/\/login\?signed-out=everywhere$/);
    await expect(page.getByTestId("login-notice")).toHaveText("You're signed out on every device.");
    expect(await spareSessions()).toBe(0);
    await other.goto("/");
    await expect(other).toHaveURL(/\/login$/);
    await other.context().close();
  });
});

test.describe("as the admin, in no workspace", () => {
  test.use({ storageState: SIGNED_OUT });

  test("reaches the account settings from the empty state, in a shell of their own", async ({
    page,
    baseURL,
  }) => {
    // A session of its own: login.spec changes the admin's password.
    await page.context().addCookies([await sessionCookie(E2E_ADMIN.email, baseURL ?? "")]);
    await page.goto("/");
    await expect(page.getByTestId("no-workspace")).toBeVisible();
    await page.getByRole("link", { name: "Account settings" }).click();
    await expect(page).toHaveURL(/\/account\/profile$/);
    await expect(page.getByTestId("account-shell")).toBeVisible();
    await expect(page.getByTestId("account-summary")).toHaveText(
      "Your profile and how you sign in.",
    );
    await expect(page.getByRole("complementary", { name: "Workspace" })).toHaveCount(0);
    const section = page.getByRole("navigation", { name: "Account settings" });
    await expect(section.getByRole("link")).toHaveText(["Profile"]);
    await expect(page.getByTestId("email-settings")).toContainText(
      `You sign in with ${E2E_ADMIN.email}.`,
    );
    await expect(page.getByRole("button", { name: "Log out everywhere" })).toBeVisible();
    await page.getByTestId("account-menu").click();
    await expect(page.getByRole("menuitem", { name: "Account" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByTestId("sign-out")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/f/anything");
    await expect(page.getByTestId("no-workspace")).toBeVisible();
  });
});
