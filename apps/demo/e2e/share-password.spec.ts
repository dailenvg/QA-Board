import type { APIRequestContext, Browser, Locator, Page } from "@playwright/test";
import { expect, test } from "./test";
import { SIGNED_OUT } from "./auth-fixtures";
import { E2E_COMPANY } from "./e2e-env";
import {
  dropPin,
  mockFrameCheck,
  setLinkPassword,
  shareImageProject,
  shareWorkspaceProject,
  showShareTab,
  skipReviewGuide,
} from "./squint-fixtures";
import { e2eWorkspaceId } from "./workspace-db";

const PROJECT = "Secret launch";
/** The site the project reviews: shown to a guest only once the link is unlocked. */
const SITE = "https://example.com/";

/** The password screen's heading for `project`. */
function invitedTo(project: string): string {
  // The brand row shows the company; the heading's accessible name keeps it.
  return `${E2E_COMPANY.name} invited you to review ${project}`;
}

/** The review's own heading: the project's name alone, not the password screen's invitation. */
function reviewHeading(guest: Page): Locator {
  return guest.getByRole("heading", { level: 1, name: PROJECT, exact: true });
}

/**
 * A documentation-range address of the guest's own, so its wrong passwords count against no
 * other test's (the limit is per address: 5 per link, 30 across links, in 15 minutes).
 */
function guestAddress(): string {
  return `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
}

/** A signed-out browser of its own, past the review guide, that never loads the real site. */
async function guestBrowser(browser: Browser, address = guestAddress()) {
  const context = await browser.newContext({
    storageState: SIGNED_OUT,
    extraHTTPHeaders: { "x-forwarded-for": address },
  });
  const guest = await context.newPage();
  await skipReviewGuide(guest);
  await mockFrameCheck(guest, {
    verdict: "embeddable",
    finalUrl: "https://example.com/",
    status: 200,
  });
  await guest.route("https://example.com/**", (route) => route.abort());
  return { context, guest };
}

/** The locked page: it says so and names the project, and shows nothing else of it. */
async function expectLocked(guest: Page, request: APIRequestContext, token: string) {
  await expect(guest.getByTestId("share-locked")).toBeVisible();
  await expect(
    guest.getByRole("heading", { level: 1, name: invitedTo(PROJECT), exact: true }),
  ).toBeVisible();
  await expect(guest.getByText("Enter the password to open it.")).toBeVisible();
  await expect(guest.getByTestId("guest-brand-name")).toHaveText(E2E_COMPANY.name);
  await expect(guest.getByTestId("pin")).toHaveCount(0);
  expect(await guest.content()).not.toContain(SITE);
  const api = await request.get(`/api/s/${token}`);
  expect(api.status()).toBe(401);
  expect(await api.json()).toEqual({ error: "password-required" });
}

function unlock(request: APIRequestContext, token: string, password: string) {
  return request.post(`/api/s/${token}/unlock`, { data: { password } });
}

test("a password locks a link until it's entered, and a new password locks it again", async ({
  page,
  browser,
}) => {
  const { token, projectId } = await shareWorkspaceProject(page, PROJECT);
  expect(await setLinkPassword(page, projectId, "first password")).toMatchObject({
    hasPassword: true,
  });
  const link = await page.request.get(
    `/api/w/${await e2eWorkspaceId()}/projects/${projectId}/share-link`,
  );
  expect(await link.json()).toMatchObject({ hasPassword: true });

  const { context, guest } = await guestBrowser(browser);
  const { request } = context;
  expect((await guest.goto(`/s/${token}`))?.status()).toBe(200);
  await expectLocked(guest, request, token);
  // The preview names the company and the project, as an open link's does, and nothing else.
  const html = await (await request.get(`/s/${token}`)).text();
  expect(html).toContain(`${E2E_COMPANY.name} invited you to review ${PROJECT}`);
  expect(html).not.toContain(SITE);

  const wrong = await unlock(request, token, "not the password");
  expect(wrong.status()).toBe(401);
  expect(await wrong.json()).toEqual({ error: "wrong-password" });
  await guest.reload();
  await expect(guest.getByTestId("share-locked")).toBeVisible();

  const right = await unlock(request, token, "first password");
  expect(right.status()).toBe(200);
  const pass = (await context.cookies()).find((cookie) => cookie.name.startsWith("squint_pass_"));
  expect(pass).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
  await guest.reload();
  await expect(reviewHeading(guest)).toBeVisible();
  expect((await request.get(`/api/s/${token}`)).status()).toBe(200);

  // A new password voids the pass at once.
  await setLinkPassword(page, projectId, "second password");
  await guest.reload();
  await expectLocked(guest, request, token);
  expect((await unlock(request, token, "first password")).status()).toBe(401);
  expect((await unlock(request, token, "second password")).status()).toBe(200);
  await guest.reload();
  await expect(reviewHeading(guest)).toBeVisible();

  // Without a password the link opens to anyone again.
  await setLinkPassword(page, projectId, null);
  await context.clearCookies();
  await guest.reload();
  await expect(reviewHeading(guest)).toBeVisible();
  await context.close();
});

/** The password screen's field, button and messages. */
function lockScreen(guest: Page) {
  return {
    field: guest.getByLabel("Password", { exact: true }),
    submit: guest.getByTestId("share-unlock-submit"),
    error: guest.getByTestId("share-unlock-error"),
  };
}

test("a guest's wrong password is cleared and said, and the right one opens the review in place", async ({
  page,
  browser,
  baseURL,
}) => {
  const { token, projectId } = await shareWorkspaceProject(page, PROJECT);
  await setLinkPassword(page, projectId, "first password");
  const { context, guest } = await guestBrowser(browser);
  await guest.goto(`/s/${token}`);
  await expectLocked(guest, context.request, token);
  const lock = lockScreen(guest);
  await expect(lock.field).toHaveAttribute("autocomplete", "current-password");

  // Sending it empty asks for it, sending nothing.
  await lock.submit.click();
  await expect(guest.getByText("Enter the password.")).toBeVisible();
  await expect(lock.field).toBeFocused();

  await lock.field.fill("not the password");
  const wrong = guest.waitForResponse((response) => response.url().endsWith("/unlock"));
  await lock.submit.click();
  expect((await wrong).status()).toBe(401);
  await expect(guest.getByRole("alert").filter({ hasText: "isn't right" })).toBeVisible();
  await expect(lock.field).toHaveValue("");
  await expect(lock.field).toBeFocused();
  await expect(lock.field).toHaveAttribute("aria-invalid", "true");

  // Show and hide the password while typing it.
  await lock.field.fill("first password");
  await guest.getByRole("button", { name: "Show password" }).click();
  await expect(lock.field).toHaveAttribute("type", "text");
  await guest.getByRole("button", { name: "Hide password" }).click();
  await expect(lock.field).toHaveAttribute("type", "password");

  // No reload: what this page set is still there once the review shows.
  await guest.evaluate(() => {
    (window as Window & { unlockMarker?: boolean }).unlockMarker = true;
  });
  await lock.field.press("Enter");
  await expect(reviewHeading(guest)).toBeVisible();
  await expect(guest.getByTestId("share-locked")).toHaveCount(0);
  await expect(guest.getByTestId("guest-brand")).toBeVisible();
  expect(
    await guest.evaluate(() => (window as Window & { unlockMarker?: boolean }).unlockMarker),
  ).toBe(true);
  // The password went nowhere but the request's body.
  expect(guest.url()).toBe(`${baseURL}/s/${token}`);
  const kept = await guest.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(kept).not.toContain("first password");
  await context.close();
});

test("too many wrong passwords say how long to wait, and hold the button until then", async ({
  page,
  browser,
}) => {
  const { token, projectId } = await shareWorkspaceProject(page, PROJECT);
  await setLinkPassword(page, projectId, "first password");
  const address = guestAddress();
  const { context, guest } = await guestBrowser(browser, address);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const wrong = await context.request.post(`/api/s/${token}/unlock`, {
      data: { password: `wrong ${attempt}` },
      headers: { "x-forwarded-for": address },
    });
    expect(wrong.status()).toBe(401);
  }

  await guest.goto(`/s/${token}`);
  const lock = lockScreen(guest);
  await lock.field.fill("first password");
  const limited = guest.waitForResponse((response) => response.url().endsWith("/unlock"));
  await lock.submit.click();
  expect((await limited).status()).toBe(429);
  await expect(lock.error).toContainText(/Too many attempts\. Try again in 1[45] minutes\./);
  await expect(lock.submit).toHaveAttribute("aria-disabled", "true");
  // Held: pressing it again sends nothing.
  let sent = 0;
  guest.on("request", (request) => {
    if (request.url().endsWith("/unlock")) sent += 1;
  });
  await lock.field.press("Enter");
  await lock.submit.click({ force: true });
  await expect(lock.error).toContainText("Too many attempts");
  expect(sent).toBe(0);
  await expect(guest.getByTestId("share-locked")).toBeVisible();
  await context.close();
});

/** The guest's review refreshes on focus: until the password screen takes its place. */
async function refreshUntilLocked(guest: Page): Promise<void> {
  await expect(async () => {
    await guest.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(guest.getByTestId("share-locked")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/** Saves `password` in the open Share dialog's field and waits for the server to have it. */
async function savePassword(page: Page, dialog: Locator, label: string, password: string) {
  const field = dialog.getByLabel(label, { exact: true });
  await expect(field).toBeFocused();
  await field.fill(password);
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/share-link/password") && response.request().method() === "PUT",
  );
  await field.press("Enter");
  expect((await saved).status()).toBe(200);
  await expect(dialog.getByTestId("share-password-status")).toHaveText("Password saved");
}

test("the owner adds, changes and removes the password in the Share dialog; an open guest tab locks and keeps its draft", async ({
  page,
  browser,
}) => {
  const link = await shareImageProject(page, "launch.png");
  await page.getByTestId("share-button").click();
  const dialog = page.getByTestId("share-dialog");
  await showShareTab(dialog, "settings");
  const state = dialog.getByTestId("share-password-state");
  const toggle = dialog.getByRole("switch", { name: "Password" });
  await expect(state).toHaveText("Off: anyone with the link can open it");
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  // Add: checked on blur, 8 to 128 characters, then saved and never shown again.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  const field = dialog.getByLabel("Password for this link", { exact: true });
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("autocomplete", "new-password");
  await field.fill("short");
  await field.blur();
  await expect(dialog.getByText("Use at least 8 characters.")).toBeVisible();
  // Escape closes the field first, not the dialog.
  await field.press("Escape");
  await expect(dialog.getByTestId("share-password-form")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await savePassword(page, dialog, "Password for this link", "first password");
  await expect(state).toContainText(/^On since \w{3} \d{1,2}, \d{4}: guests enter it/);
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(dialog.getByTestId("share-password-form")).toHaveCount(0);
  await expect(dialog.getByTestId("share-password-change")).toBeFocused();
  await expect(dialog).not.toContainText("first password");
  await expect(page.getByTestId("share-button")).toHaveAccessibleName(
    "Share, link is on, password protected",
  );

  // A guest unlocks and starts a comment.
  const { context, guest } = await guestBrowser(browser);
  await guest.goto(link);
  await expect(
    guest.getByRole("heading", { level: 1, name: invitedTo("launch"), exact: true }),
  ).toBeVisible();
  const lock = lockScreen(guest);
  await lock.field.fill("first password");
  await lock.submit.click();
  await expect(guest.getByRole("img", { name: /the image under review/ })).toBeVisible();
  const composer = await dropPin(guest, { x: 140, y: 110 });
  await composer.getByLabel("Your name").fill("Cleo");
  await composer.getByLabel("Comment", { exact: true }).fill("Half-written thought");

  // Change: the guest's tab goes back to the password screen, saying the draft is kept.
  await dialog.getByTestId("share-password-change").click();
  await savePassword(page, dialog, "New password", "second password");
  await refreshUntilLocked(guest);
  await expect(guest.getByTestId("share-locked-notice")).toContainText(
    "Your unsent comment is kept.",
  );
  await expect(lock.field).toBeFocused();
  await lock.field.fill("first password");
  await lock.submit.click();
  await expect(guest.getByRole("alert").filter({ hasText: "isn't right" })).toBeVisible();
  await lock.field.fill("second password");
  await lock.submit.click();
  await expect(composer.getByLabel("Comment", { exact: true })).toHaveValue("Half-written thought");
  await expect(composer.getByTestId("composer-send-error")).toContainText("wasn't sent yet");
  await composer.getByRole("button", { name: "Retry" }).click();
  await expect(composer).toHaveCount(0);

  // Remove: asked first, here in the dialog, with Cancel focused.
  await toggle.click();
  const confirm = dialog.getByTestId("share-password-confirm");
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(state).toContainText("On since");
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  const removed = page.waitForResponse(
    (response) =>
      response.url().endsWith("/share-link/password") && response.request().method() === "DELETE",
  );
  await confirm.getByTestId("share-password-remove-confirm").click();
  expect((await removed).status()).toBe(200);
  await expect(dialog.getByTestId("share-password-status")).toHaveText("Password removed");
  await expect(state).toHaveText("Off: anyone with the link can open it");
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await context.close();

  // A new guest opens it without a password again.
  const fresh = await guestBrowser(browser);
  await fresh.guest.goto(link);
  await expect(fresh.guest.getByRole("img", { name: /the image under review/ })).toBeVisible();
  await expect(fresh.guest.getByTestId("share-locked")).toHaveCount(0);
  await fresh.context.close();
});
