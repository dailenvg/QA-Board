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

/** The Integrations card's ClickUp row, on the workspace settings. */
async function openClickUp(page: Page) {
  await page.goto("/account/workspace");
  const row = page.getByTestId("clickup-integration");
  await row.scrollIntoViewIfNeeded();
  await expect(row).toBeVisible();
  return row;
}

test("the owner connects ClickUp with a personal token, then disconnects it", async ({ page }) => {
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
  await expect(row.getByTestId("clickup-connected-by")).toContainText("Connected by");
  await page.reload();
  await expect(page.getByTestId("clickup-team")).toHaveText(ACME?.name ?? "");
  expect(await page.content()).not.toContain(CLICKUP_STUB.ONE_WORKSPACE);

  // Disconnect asks first; Cancel keeps it, and focus goes back to Disconnect.
  const reloaded = page.getByTestId("clickup-integration");
  const disconnect = reloaded.getByTestId("clickup-disconnect");
  await disconnect.click();
  const confirm = reloaded.getByTestId("clickup-disconnect-confirm");
  await expect(confirm).toContainText("still works in ClickUp until you regenerate it");
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

test("a member sees what's connected, but can't connect or disconnect", async ({
  page,
  browser,
  baseURL,
}) => {
  await withWorkspaceMember(async () => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    await context.addCookies([await sessionCookie(CLICKUP_MEMBER_EMAIL, baseURL ?? "")]);
    const member = await context.newPage();
    try {
      const row = await openClickUp(member);
      await expect(row).toContainText(
        "Only the workspace's owner can connect or disconnect ClickUp.",
      );
      await expect(row.getByLabel("ClickUp personal API token")).toHaveCount(0);

      const owner = await openClickUp(page);
      await owner.getByLabel("ClickUp personal API token").fill(CLICKUP_STUB.ONE_WORKSPACE);
      await owner.getByTestId("clickup-connect").click();
      await expect(owner).toHaveAttribute("data-state", "connected");

      const connected = await openClickUp(member);
      await expect(connected.getByTestId("clickup-team")).toHaveText(ACME?.name ?? "");
      await expect(connected.getByTestId("clickup-username")).toHaveText(
        CLICKUP_STUB.USER.username,
      );
      await expect(connected.getByTestId("clickup-disconnect")).toHaveCount(0);
      await expect(connected.getByTestId("clickup-member-note")).toContainText(
        "Only the workspace's owner can connect or disconnect ClickUp.",
      );
    } finally {
      await context.close();
    }
  });
});
