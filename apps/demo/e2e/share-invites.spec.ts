import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./test";
import { SIGNED_OUT } from "./auth-fixtures";
import { E2E_COMPANY } from "./e2e-env";
import { mockFrameCheck, shareWorkspaceProject, showShareTab } from "./squint-fixtures";
import { ageShareLink } from "./workspace-db";

const PROJECT = "Spring Campaign";
const CLIENT = "Acme Studio";

/** Opens the owner's Share window on a project shared through the workspace API. */
async function openShareWindow(page: Page, projectId: string): Promise<Locator> {
  await mockFrameCheck(page, {
    verdict: "embeddable",
    finalUrl: "https://example.com/",
    status: 200,
  });
  await page.route("https://example.com/**", (route) => route.abort());
  await page.goto(`/p/${projectId}`);
  await page.getByTestId("share-button").click();
  const dialog = page.getByTestId("share-dialog");
  await expect(dialog).toBeVisible();
  await showShareTab(dialog, "invite");
  return dialog;
}

function invitesAnswer(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.url().endsWith("/share-link/invites") && response.request().method() === "POST",
  );
}

test("the owner names the client and emails the link, and the guest's invitation names them", async ({
  page,
  browser,
}) => {
  const { token, projectId } = await shareWorkspaceProject(page, PROJECT);
  const dialog = await openShareWindow(page, projectId);
  // Enter saves the client's name.
  const name = dialog.getByLabel("Client name");
  await name.fill(CLIENT);
  const named = page.waitForResponse(
    (response) =>
      response.url().endsWith("/share-link/settings") && response.request().method() === "PATCH",
  );
  await name.press("Enter");
  expect((await named).status()).toBe(200);
  await expect(dialog.getByTestId("client-name-status")).toHaveText("Saved");

  // Chips: what isn't an address is marked and explained, and holds Send back.
  const emails = dialog.getByLabel("Email them the link");
  const chips = dialog.getByTestId("invite-chip");
  const send = dialog.getByTestId("send-invites");
  await expect(dialog.getByTestId("invites-sent")).toHaveText("No invites sent yet");
  await emails.fill("not-an-email");
  await emails.press("Enter");
  await expect(chips).toHaveCount(1);
  await expect(chips.first()).toHaveAttribute("data-problem", "invalid");
  await expect(dialog).toContainText(`"not-an-email" isn't an email address.`);
  await expect(send).toHaveAttribute("aria-disabled", "true");
  await dialog.getByRole("button", { name: "Remove not-an-email" }).click();
  await expect(chips).toHaveCount(0);
  await expect(emails).toBeFocused();

  // A comma ends an address; Backspace in the empty field takes the last chip back.
  await emails.fill("ana@acme.studio, owner@e2e.test,");
  await expect(chips).toHaveCount(2);
  await emails.press("Backspace");
  await expect(chips).toHaveCount(1);
  await emails.fill(`${E2E_COMPANY.email},`);
  await expect(chips).toHaveCount(2);
  await expect(send).toHaveText("Send 2 invites");

  // The e2e server is a preview: it only emails the workspace's members.
  const refused = invitesAnswer(page);
  await send.click();
  expect((await refused).status()).toBe(403);
  await expect(chips.filter({ hasText: "ana@acme.studio" })).toHaveAttribute(
    "data-problem",
    "outside",
  );
  await expect(dialog).toContainText("This preview site only emails people in your workspace.");
  await dialog.getByRole("button", { name: "Remove ana@acme.studio" }).click();

  // The owner's own address goes (the email is skipped without Resend), and the count follows.
  const sent = invitesAnswer(page);
  await send.click();
  expect((await sent).status()).toBe(200);
  await expect(
    page.getByTestId("toast").filter({ hasText: "Invite sent to 1 person." }),
  ).toBeVisible();
  await expect(dialog.getByTestId("invites-sent")).toHaveText("Sent to 1 person so far");
  await expect(chips).toHaveCount(0);

  // The guest's invitation and the link's preview name the client.
  const unfurl = await page.request.get(`/s/${token}`);
  expect(await unfurl.text()).toContain(
    `${E2E_COMPANY.name} invited ${CLIENT} to review ${PROJECT}`,
  );
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const guest = await context.newPage();
  await mockFrameCheck(guest, {
    verdict: "embeddable",
    finalUrl: "https://example.com/",
    status: 200,
  });
  await guest.route("https://example.com/**", (route) => route.abort());
  await guest.goto(`/s/${token}`);
  const guide = guest.getByRole("dialog", { name: "How it works" });
  await expect(guide).toHaveAccessibleDescription(
    new RegExp(`^${E2E_COMPANY.name} has invited ${CLIENT} to review ${PROJECT}\\.`),
  );
  await context.close();
});

test("Slack copies the invitation message and opens Slack; Copy link copies the link", async ({
  page,
  context,
  baseURL,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  // Never reach Slack itself: its tab opens on a stand-in.
  await context.route("https://app.slack.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Slack</title>" }),
  );
  const { token, projectId } = await shareWorkspaceProject(page, PROJECT);
  const dialog = await openShareWindow(page, projectId);
  const status = dialog.getByTestId("share-other-ways-status");

  const opened = context.waitForEvent("page");
  await dialog.getByTestId("share-via-slack").click();
  await expect(status).toHaveText("Message copied. Paste it into Slack.");
  const slack = await opened;
  expect(slack.url()).toBe("https://app.slack.com/client");
  await slack.close();
  const message = await page.evaluate(() => navigator.clipboard.readText());
  expect(message.split("\n").slice(0, 4)).toEqual([
    "Hi,",
    "",
    `${E2E_COMPANY.name} has invited you to review ${PROJECT}:`,
    `${baseURL}/s/${token}`,
  ]);
  expect(message).toContain("You have about 3 days to comment.");
  expect(message).not.toContain("password");

  await dialog.getByTestId("copy-share-link").click();
  await expect(status).toHaveText("Link copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}/s/${token}`);
});

test("a closed review holds Send, and Go to settings takes the keyboard to the review window", async ({
  page,
}) => {
  const { projectId } = await shareWorkspaceProject(page, PROJECT);
  // Created 80 hours ago: its 3 days are over.
  await ageShareLink(projectId, 80);
  const dialog = await openShareWindow(page, projectId);
  const error = dialog.getByTestId("invite-error");
  await expect(error).toContainText("The review window has closed");

  // Send stays off: nothing goes, however it's pressed.
  let sends = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/share-link/invites")) sends += 1;
  });
  const emails = dialog.getByLabel("Email them the link");
  await emails.fill(`${E2E_COMPANY.email},`);
  const send = dialog.getByTestId("send-invites");
  await expect(send).toHaveAttribute("aria-disabled", "true");
  // aria-disabled keeps it focusable and clickable: Playwright's click would wait for it to enable.
  await send.dispatchEvent("click");
  await expect(dialog.getByTestId("invite-chip")).toHaveCount(1);
  expect(sends).toBe(0);

  // On a phone the Settings tab opens first; the window's chosen length takes focus once it's there.
  const goTo = error.getByRole("button", { name: "Go to settings" });
  await goTo.focus();
  await page.keyboard.press("Enter");
  const chosen = dialog.getByTestId("share-settings-step").getByTestId("review-window-72h");
  await expect(chosen).toBeFocused();
  await expect(chosen).toHaveAttribute("aria-checked", "true");
  expect(
    await page.evaluate(() =>
      Boolean(document.activeElement?.closest('[data-testid="share-dialog"]')),
    ),
  ).toBe(true);
});

test("on a phone, the Invite and Settings tabs keep the sheet one height", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Phones only: wider windows show both steps at once.");
  const { projectId } = await shareWorkspaceProject(page, PROJECT);
  const dialog = await openShareWindow(page, projectId);
  const height = async () => (await dialog.boundingBox())?.height;
  const invite = await height();
  await showShareTab(dialog, "settings");
  await expect(dialog.getByTestId("share-settings-step")).toBeVisible();
  expect(await height()).toBe(invite);
  await showShareTab(dialog, "invite");
  await expect(dialog.getByTestId("share-invite-step")).toBeVisible();
  expect(await height()).toBe(invite);
});
