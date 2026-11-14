import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./test";
import {
  CLICKUP_STUB,
  connectClickUp,
  failStubChannelLists,
  forbidStubChannel,
  removeStubChannel,
  resetClickUpStub,
  revokeClickUpToken,
  stubMessages,
} from "./clickup-fixtures";
import { addDefaultFolder, DEFAULT_FOLDER, mockFrameCheck } from "./squint-fixtures";
import { e2eWorkspaceId } from "./workspace-db";

const PROJECT = "Spring brief";
const [, ANA, BO, CY] = CLICKUP_STUB.MEMBERS;
/** The channels a message can go to: no DMs, archived or hidden ones. */
const OPEN_CHANNELS = ["bugs", "design-review", "general", "marketing"];
const NOTIFIED = "They're notified in ClickUp.";
const GONE = "That channel isn't in ClickUp anymore. Pick another from the refreshed list.";

/**
 * Where focus goes in the channel list: its search, or on phones (the
 * mobile project) the radio `radio`, so no keyboard comes up.
 */
function channelFocus(channel: Locator, isMobile: boolean, radio = "#bugs"): Locator {
  return isMobile
    ? channel.getByRole("radio", { name: radio })
    : channel.getByTestId("clickup-channel-search");
}

/** The stub's id for the channel named `name`. */
function channelId(name: string): string {
  return CLICKUP_STUB.CHANNELS.find((channel) => channel.name === name)?.id ?? "";
}

test.beforeEach(async () => {
  await resetClickUpStub();
});

/** A website project in DEFAULT_FOLDER, made through the server; its id. */
async function workspaceProject(page: Page, name: string): Promise<string> {
  await addDefaultFolder(page);
  const id = `clickup-${Date.now().toString(36)}`;
  const response = await page.request.post(`/api/w/${await e2eWorkspaceId()}/projects`, {
    data: {
      id,
      folderId: DEFAULT_FOLDER.id,
      name,
      source: { kind: "url", url: "https://example.com/" },
    },
  });
  expect(response.status()).toBe(201);
  return id;
}

/** Opens the project's viewer, then the Send to ClickUp window. */
async function openSendWindow(page: Page, projectId: string): Promise<Locator> {
  await mockFrameCheck(page, {
    verdict: "embeddable",
    finalUrl: "https://example.com/",
    status: 200,
  });
  await page.route("https://example.com/**", (route) => route.abort());
  await page.goto(`/p/${projectId}`);
  await page.getByRole("button", { name: "Send to ClickUp" }).click();
  const dialog = page.getByTestId("clickup-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Picks the option of `picker` labelled `name` after searching for `query`. */
async function pick(dialog: Locator, picker: string, query: string, name: string) {
  const list = dialog.getByTestId(picker);
  await list.getByTestId(`${picker}-search`).fill(query);
  await list.getByTestId(`${picker}-option`).filter({ hasText: name }).click();
}

test("a member sends a project to a ClickUp channel, assigned, with followers and a note", async ({
  page,
}) => {
  await connectClickUp();
  const projectId = await workspaceProject(page, PROJECT);
  const dialog = await openSendWindow(page, projectId);

  // The channels load (the stub sends two a page), open ones only, by name.
  const channel = dialog.getByTestId("clickup-channel");
  await expect(channel.getByTestId("clickup-channel-option")).toHaveText(
    OPEN_CHANNELS.map((name) => `#${name}`),
  );
  await expect(dialog.getByTestId("clickup-send-loading")).toHaveCount(0);

  // Search narrows the list, and says when nothing matches.
  const search = channel.getByTestId("clickup-channel-search");
  await search.fill("zzz");
  await expect(channel.getByTestId("clickup-channel-status")).toHaveText(
    "No channel matches “zzz”.",
  );
  await search.fill("DESIGN");
  await expect(channel.getByTestId("clickup-channel-option")).toHaveText(["#design-review"]);
  await channel.getByTestId("clickup-channel-option").click();
  await expect(channel.getByRole("radio", { name: "#design-review" })).toBeChecked();

  await pick(dialog, "clickup-assignee", "ana", ANA?.username ?? "");
  await expect(
    dialog.getByTestId("clickup-assignee").getByRole("radio", { name: ANA?.username }),
  ).toBeChecked();
  await pick(dialog, "clickup-followers", "bo", BO?.username ?? "");
  await pick(dialog, "clickup-followers", "cy@", CY?.username ?? "");
  await expect(dialog.getByTestId("clickup-followers-chip")).toHaveText([
    BO?.username ?? "",
    CY?.username ?? "",
  ]);

  // The note, previewed as typed; its link and mention go as plain text.
  const note = dialog.getByLabel("Note");
  await note.fill("Please check the [hero](https://evil.test)\n@everyone");
  await expect(dialog.getByTestId("clickup-note-left")).toHaveText("948 left");
  const preview = dialog.getByTestId("clickup-preview");
  await expect(preview.getByTestId("clickup-preview-project")).toHaveText(PROJECT);
  await expect(preview.getByTestId("clickup-preview-note")).toHaveText(
    "Please check the [hero](https://evil.test)\n@everyone",
  );
  await expect(preview.getByTestId("clickup-preview-meta")).toHaveText(
    `Assigned to ${ANA?.username} · 2 followers`,
  );
  await expect(preview.getByRole("link")).toHaveCount(0);

  await dialog.getByTestId("clickup-send").click();
  await expect(dialog).toBeHidden();
  const toast = page.getByTestId("toast");
  await expect(toast).toContainText("Sent to #design-review.");
  await expect(toast.getByRole("button", { name: "Open in ClickUp" })).toBeVisible();

  const [message, ...others] = await stubMessages();
  expect(others).toEqual([]);
  expect(message?.channelId).toBe("6-901-2");
  expect(message?.body).toMatchObject({
    type: "message",
    content_format: "text/md",
    assignee: String(ANA?.id),
    followers: [String(BO?.id), String(CY?.id)],
  });
  const [title, body, footer] = message?.body.content.split("\n\n") ?? [];
  expect(title).toMatch(
    new RegExp(`^\\*\\*\\[Spring brief\\]\\(https?://[^)]+/p/${projectId}\\)\\*\\*$`),
  );
  expect(body).toBe("Please check the \\[hero\\]\\(https\\:\\/\\/evil\\.test\\)\\\n\\@everyone");
  expect(footer).toBe("_Sent for review from Squint_");

  // Next time, it starts on the channel last sent to, with a fresh note.
  await page.getByRole("button", { name: "Send to ClickUp" }).click();
  await expect(
    dialog.getByTestId("clickup-channel").getByRole("radio", { name: "#design-review" }),
  ).toBeChecked();
  await expect(dialog.getByLabel("Note")).toHaveValue("");
});

test("Send asks for a channel first, and nothing goes", async ({ page }) => {
  await connectClickUp();
  const dialog = await openSendWindow(page, await workspaceProject(page, PROJECT));
  await expect(dialog.getByTestId("clickup-channel-option")).toHaveCount(OPEN_CHANNELS.length);
  await dialog.getByTestId("clickup-send").click();
  await expect(dialog.getByText("Pick a channel to send to.")).toBeVisible();
  expect(await stubMessages()).toEqual([]);
});

test("Enter in the lists picks without sending, and a removed follower's search takes focus", async ({
  page,
  isMobile,
}) => {
  await connectClickUp();
  const dialog = await openSendWindow(page, await workspaceProject(page, PROJECT));
  const channel = dialog.getByTestId("clickup-channel");
  const search = channel.getByTestId("clickup-channel-search");
  // Phones keep focus on Close as the window opens (moving it would raise the keyboard).
  if (!isMobile) await expect(search).toBeFocused();

  // Enter in a search picks its first match; on a radio it does nothing. Neither sends.
  await search.fill("design");
  await search.press("Enter");
  const designReview = channel.getByRole("radio", { name: "#design-review" });
  await expect(designReview).toBeChecked();
  await designReview.press("Enter");
  await expect(designReview).toBeChecked();
  await expect(dialog.getByTestId("clickup-send")).toHaveText("Send");

  // Who's notified, under each of the people's lists.
  await expect(dialog.getByTestId("clickup-assignee-hint")).toHaveText(NOTIFIED);
  await expect(dialog.getByTestId("clickup-followers-hint")).toHaveText(NOTIFIED);

  // Enter ticks the first follower matching; on the checkbox it leaves it ticked.
  const followers = dialog.getByTestId("clickup-followers");
  const followerSearch = followers.getByTestId("clickup-followers-search");
  await followerSearch.fill("bo");
  await followerSearch.press("Enter");
  await expect(followers.getByTestId("clickup-followers-chip")).toHaveText([BO?.username ?? ""]);
  const bo = followers.getByRole("checkbox", { name: BO?.username });
  await bo.press("Enter");
  await expect(bo).toBeChecked();

  // Removing the chip takes its button away: focus goes to that list's search.
  await followers.getByRole("button", { name: `Remove ${BO?.username}` }).click();
  await expect(followers.getByTestId("clickup-followers-chip")).toHaveCount(0);
  await expect(followerSearch).toBeFocused();

  await expect(dialog).toBeVisible();
  expect(await stubMessages()).toEqual([]);
});

test("a channel deleted in ClickUp is dropped in place, and the list takes focus", async ({
  page,
  isMobile,
}) => {
  await connectClickUp();
  const dialog = await openSendWindow(page, await workspaceProject(page, PROJECT));
  const channel = dialog.getByTestId("clickup-channel");
  await channel.getByTestId("clickup-channel-option").filter({ hasText: "general" }).click();
  await removeStubChannel(channelId("general"));
  await dialog.getByTestId("clickup-send").click();

  await expect(channel.getByRole("alert")).toHaveText(GONE);
  await expect(channelFocus(channel, isMobile)).toBeFocused();
  await expect(channel.getByTestId("clickup-channel-option")).toHaveText(
    OPEN_CHANNELS.filter((name) => name !== "general").map((name) => `#${name}`),
  );
  await expect(channel.getByRole("radio", { checked: true })).toHaveCount(0);
  // Once the list is read again, focus is still there and the form never left.
  await expect(channel.locator("[data-busy]")).toHaveCount(0);
  await expect(channelFocus(channel, isMobile)).toBeFocused();
  await expect(dialog.getByTestId("clickup-dialog-body")).toHaveAttribute("data-state", "ready");
  expect(await stubMessages()).toEqual([]);
});

test("a channel the member can't post in says so under the list, which takes focus", async ({
  page,
  isMobile,
}) => {
  await connectClickUp();
  const dialog = await openSendWindow(page, await workspaceProject(page, PROJECT));
  const channel = dialog.getByTestId("clickup-channel");
  await channel.getByTestId("clickup-channel-option").filter({ hasText: "marketing" }).click();
  await forbidStubChannel(channelId("marketing"));
  await dialog.getByTestId("clickup-send").click();

  await expect(channel.getByRole("alert")).toHaveText(
    "You can't post in #marketing in ClickUp. Pick another channel, or ask a ClickUp admin to add you.",
  );
  await expect(channelFocus(channel, isMobile)).toBeFocused();
  await expect(channel.getByRole("radio", { name: "#marketing" })).not.toBeChecked();
  // Not a reason to reconnect: the token still works.
  await expect(dialog.getByTestId("clickup-send-blocked")).toHaveCount(0);
  expect(await stubMessages()).toEqual([]);
});

test("lists that didn't load offer Try again, and the channel list takes focus once they do", async ({
  page,
  isMobile,
}) => {
  await connectClickUp();
  await failStubChannelLists(1);
  const dialog = await openSendWindow(page, await workspaceProject(page, PROJECT));
  const failed = dialog.getByTestId("clickup-send-load-error");
  await expect(failed).toContainText("Your ClickUp channels didn't load.");
  await failed.getByRole("button", { name: "Try again" }).click();
  await expect(dialog.getByTestId("clickup-channel-option")).toHaveCount(OPEN_CHANNELS.length);
  await expect(channelFocus(dialog.getByTestId("clickup-channel"), isMobile)).toBeFocused();
});

test("without a connection, the window leads to the profile's ClickUp card", async ({ page }) => {
  const dialog = await openSendWindow(page, await workspaceProject(page, PROJECT));
  const blocked = dialog.getByTestId("clickup-send-blocked");
  await expect(blocked).toHaveAttribute("data-reason", "not-connected");
  await expect(blocked).toContainText("Plug in your ClickUp");
  await expect(dialog.getByTestId("clickup-send")).toHaveCount(0);
  await blocked.getByRole("link", { name: "Connect ClickUp" }).click();
  await expect(page).toHaveURL(/\/account\/profile#clickup$/);
  await expect(page.getByTestId("clickup-settings")).toBeInViewport();
});

test("a token ClickUp refuses asks the member to reconnect", async ({ page }) => {
  await connectClickUp();
  await revokeClickUpToken(CLICKUP_STUB.ONE_WORKSPACE);
  const dialog = await openSendWindow(page, await workspaceProject(page, PROJECT));
  const blocked = dialog.getByTestId("clickup-send-blocked");
  await expect(blocked).toHaveAttribute("data-reason", "reconnect");
  await expect(blocked.getByRole("link", { name: "Reconnect ClickUp" })).toHaveAttribute(
    "href",
    "/account/profile#clickup",
  );
});

test("a token refused while the window is open turns it into the way to reconnect", async ({
  page,
}) => {
  await connectClickUp();
  const dialog = await openSendWindow(page, await workspaceProject(page, PROJECT));
  await dialog.getByTestId("clickup-channel-option").filter({ hasText: "general" }).click();
  await revokeClickUpToken(CLICKUP_STUB.ONE_WORKSPACE);
  await dialog.getByTestId("clickup-send").click();
  await expect(dialog.getByTestId("clickup-send-blocked")).toHaveAttribute(
    "data-reason",
    "reconnect",
  );
  expect(await stubMessages()).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 740 }, hasTouch: true });

  test("the button is an icon with a name, and the window is a bottom sheet", async ({ page }) => {
    await connectClickUp();
    await openSendWindow(page, await workspaceProject(page, PROJECT));
    const dialog = page.getByTestId("clickup-dialog");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    const button = page.getByTestId("clickup-button");
    await expect(button).toHaveAccessibleName("Send to ClickUp");
    const box = await button.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeLessThan(60);

    await button.click();
    await expect(dialog.getByTestId("clickup-channel-option")).toHaveCount(OPEN_CHANNELS.length);
    // Edge to edge, down to the bottom of the screen; the footer's Send stays in reach.
    await expect
      .poll(async () => {
        const sheet = await dialog.boundingBox();
        return sheet && Math.round(sheet.y + sheet.height);
      })
      .toBe(740);
    expect((await dialog.boundingBox())?.width).toBe(375);
    await expect(dialog.getByTestId("clickup-send")).toBeInViewport();
    // The page behind never scrolls sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );
  });
});
