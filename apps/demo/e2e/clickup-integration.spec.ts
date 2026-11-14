import type { Page } from "@playwright/test";
import { expect, test } from "./test";
import { sessionCookie } from "./auth-fixtures";
import {
  CLICKUP_MEMBER_EMAIL,
  CLICKUP_STUB,
  UNKNOWN_TOKEN,
  withWorkspaceMember,
} from "./clickup-fixtures";

const [ACME, SIDE] = CLICKUP_STUB.TEAMS;

/** The ClickUp card's body, on the profile settings. */
async function openClickUp(page: Page) {
  await page.goto("/account/profile");
  const row = page.getByTestId("clickup-integration");
  await row.scrollIntoViewIfNeeded();
  await expect(row).toBeVisible();
  return row;
}

test("a member connects their own ClickUp with a personal token, then disconnects it", async ({
  page,
}) => {
  const row = await openClickUp(page);
  await expect(row).toHaveAttribute("data-state", "disconnected");
  const field = row.getByLabel("ClickUp personal API token");
  await expect(field).toHaveAttribute("type", "password");
  // Password managers are asked to leave it alone: it's a token, not a sign-in password.
  await expect(field).toHaveAttribute("autocomplete", "off");
  await expect(field).toHaveAttribute("data-1p-ignore", "true");
  await expect(field).toHaveAttribute("data-lpignore", "true");

  // Its shape is checked as the field loses focus, before anything is sent.
  await field.fill("not-a-token");
  await field.blur();
  await expect(
    row.getByText("That doesn't look like a ClickUp API token", { exact: false }),
  ).toBeVisible();
  await expect(field).toHaveAttribute("aria-invalid", "true");

  // ClickUp refuses a well-shaped token it doesn't know.
  await field.fill(UNKNOWN_TOKEN);
  await row.getByTestId("clickup-connect").click();
  await expect(row.getByText("ClickUp didn't accept that token.", { exact: false })).toBeVisible();
  await expect(field).toBeFocused();

  // Show reveals what was pasted; the token it connects with never comes back.
  await field.fill(CLICKUP_STUB.ONE_WORKSPACE);
  await row.getByRole("button", { name: "Show token" }).click();
  await expect(field).toHaveAttribute("type", "text");
  await expect(row.getByRole("button", { name: "Hide token" })).toBeVisible();
  await row.getByTestId("clickup-connect").click();

  // The form goes once connected, so focus moves to the row rather than dropping to the page.
  await expect(row).toHaveAttribute("data-state", "connected");
  await expect(row).toBeFocused();
  await expect(row.getByTestId("clickup-notice")).toHaveText("ClickUp is connected.");
  await expect(row.getByTestId("clickup-team")).toHaveText(ACME?.name ?? "");
  await expect(row.getByTestId("clickup-username")).toHaveText(CLICKUP_STUB.USER.username);
  await expect(row.getByTestId("clickup-connected-on")).toContainText("Connected on");
  await page.reload();
  await expect(page.getByTestId("clickup-team")).toHaveText(ACME?.name ?? "");
  expect(await page.content()).not.toContain(CLICKUP_STUB.ONE_WORKSPACE);

  // Disconnect asks first; Cancel keeps it, and focus goes back to Disconnect.
  const reloaded = page.getByTestId("clickup-integration");
  const disconnect = reloaded.getByTestId("clickup-disconnect");
  await disconnect.click();
  const confirm = reloaded.getByTestId("clickup-disconnect-confirm");
  await expect(confirm).toContainText("still works in ClickUp until you regenerate it");
  await expect(confirm).toContainText(`send projects to ${ACME?.name}`);
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
  await expect(reloaded.getByTestId("clickup-disconnect")).toBeFocused();

  await reloaded.getByTestId("clickup-disconnect").click();
  await reloaded.getByTestId("clickup-disconnect-confirm-button").click();
  await expect(reloaded).toHaveAttribute("data-state", "disconnected");
  await expect(reloaded.getByTestId("clickup-notice")).toContainText("ClickUp is disconnected.");
  await expect(reloaded.getByLabel("ClickUp personal API token")).toHaveValue("");
});

test("a token that reaches several ClickUp workspaces asks which one, in the same form", async ({
  page,
}) => {
  const row = await openClickUp(page);
  const field = row.getByLabel("ClickUp personal API token");
  await field.fill(CLICKUP_STUB.TWO_WORKSPACES);
  await row.getByTestId("clickup-connect").click();

  const choice = row.getByTestId("clickup-team-choice");
  await expect(choice).toBeVisible();
  await expect(choice.getByRole("radio")).toHaveCount(2);
  // Focus goes to the choice as it opens, so it's what a screen reader reads next.
  await expect(choice.getByRole("radio", { name: ACME?.name })).toBeFocused();
  const submit = row.getByTestId("clickup-connect");
  await expect(submit).toHaveText("Connect workspace");
  await submit.click();
  await expect(choice.getByText("Pick a ClickUp workspace first.")).toBeVisible();
  await expect(choice.getByRole("radio", { name: ACME?.name })).toBeFocused();

  // Each choice is a 44px target, picked from the keyboard too.
  const option = row.getByTestId(`clickup-team-${SIDE?.id}`);
  // Polled: the choice pops in, scaled down until it settles.
  await expect.poll(async () => (await option.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await choice.getByRole("radio", { name: ACME?.name }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(choice.getByRole("radio", { name: SIDE?.name })).toBeChecked();

  await submit.click();
  await expect(row).toHaveAttribute("data-state", "connected");
  await expect(row.getByTestId("clickup-team")).toHaveText(SIDE?.name ?? "");
});

test("editing the token closes the choice of ClickUp workspaces", async ({ page }) => {
  const row = await openClickUp(page);
  const field = row.getByLabel("ClickUp personal API token");
  await field.fill(CLICKUP_STUB.TWO_WORKSPACES);
  await row.getByTestId("clickup-connect").click();
  await expect(row.getByTestId("clickup-team-choice")).toBeVisible();
  await field.fill(CLICKUP_STUB.ONE_WORKSPACE);
  await expect(row.getByTestId("clickup-team-choice")).toBeHidden();
  await expect(row.getByTestId("clickup-connect")).toHaveText("Connect ClickUp");
});

test("the card sits in the profile, not the workspace settings, and a link leads straight to it", async ({
  page,
}) => {
  await page.goto("/account/workspace");
  await expect(page.getByTestId("workspace-settings")).toBeVisible();
  await expect(page.getByTestId("clickup-settings")).toHaveCount(0);
  await page.goto("/account/profile#clickup");
  const card = page.getByTestId("clickup-settings");
  await expect(card).toBeInViewport();
  await expect(card.getByRole("heading", { name: "Your ClickUp" })).toBeVisible();
});

test("every member connects their own ClickUp, and nobody sees anyone else's", async ({
  page,
  browser,
  baseURL,
}) => {
  await withWorkspaceMember(async () => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    await context.addCookies([await sessionCookie(CLICKUP_MEMBER_EMAIL, baseURL ?? "")]);
    const member = await context.newPage();
    try {
      const owner = await openClickUp(page);
      await owner.getByLabel("ClickUp personal API token").fill(CLICKUP_STUB.ONE_WORKSPACE);
      await owner.getByTestId("clickup-connect").click();
      await expect(owner).toHaveAttribute("data-state", "connected");

      // The owner's connection is theirs: the member still connects their own.
      const row = await openClickUp(member);
      await expect(row).toHaveAttribute("data-state", "disconnected");
      await row.getByLabel("ClickUp personal API token").fill(CLICKUP_STUB.TWO_WORKSPACES);
      await row.getByTestId("clickup-connect").click();
      await row.getByTestId(`clickup-team-${SIDE?.id}`).click();
      await row.getByTestId("clickup-connect").click();
      await expect(row).toHaveAttribute("data-state", "connected");
      await expect(row.getByTestId("clickup-team")).toHaveText(SIDE?.name ?? "");

      // Disconnecting theirs leaves the owner's as it was.
      await row.getByTestId("clickup-disconnect").click();
      await row.getByTestId("clickup-disconnect-confirm-button").click();
      await expect(row).toHaveAttribute("data-state", "disconnected");
      const ownerAgain = await openClickUp(page);
      await expect(ownerAgain.getByTestId("clickup-team")).toHaveText(ACME?.name ?? "");
    } finally {
      await context.close();
    }
  });
});
