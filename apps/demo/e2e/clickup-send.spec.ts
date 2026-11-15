import type { BrowserContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./test";
import {
  CLICKUP_STUB,
  connectClickUp,
  failStubChannelLists,
  failStubPosts,
  forbidStubChannel,
  removeStubChannel,
  resetClickUpStub,
  revokeClickUpToken,
  stubMessages,
} from "./clickup-fixtures";
import { addDefaultFolder, DEFAULT_FOLDER, mockFrameCheck } from "./squint-fixtures";
import { e2eWorkspaceId } from "./workspace-db";

const PROJECT = "Spring brief";
const [, ANA] = CLICKUP_STUB.MEMBERS;
/** The channels a message can go to: no DMs, archived or hidden ones. */
const OPEN_CHANNELS = ["bugs", "design-review", "general", "marketing"];
/** The message's title, after the sender's name (their name in Squint, else their email). */
const SENT_YOU = "sent you this project to review it through Squint";
/** The message's title in Markdown, whoever sent it. */
const TITLE = new RegExp(`^\\*\\*\\S.* ${SENT_YOU}\\*\\*$`);
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

/** Where ClickUp's web app opens channel `name` of the stub's first workspace. */
function channelUrl(name: string): string {
  return `https://app.clickup.com/${CLICKUP_STUB.TEAMS[0]?.id}/chat/r/${channelId(name)}`;
}

/** Sends from the open window: Send's new tab (ClickUp's channel), once it has opened. */
async function sendAndOpen(context: BrowserContext, dialog: Locator): Promise<Page> {
  const [tab] = await Promise.all([
    context.waitForEvent("page"),
    dialog.getByTestId("clickup-send").click(),
  ]);
  await tab.waitForLoadState();
  return tab;
}

test.beforeEach(async ({ context, baseURL }) => {
  await resetClickUpStub();
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  // The channel's tab stays on this machine: ClickUp's web app answers with a stand-in.
  await context.route("https://app.clickup.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>ClickUp</title>" }),
  );
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

test("one click copies the link, opens the channel, and posts the message, assigned, with a note", async ({
  page,
  context,
  baseURL,
}) => {
  await connectClickUp();
  const projectId = await workspaceProject(page, PROJECT);
  // Every answer the page gets from Squint, to check the token never reaches the browser.
  const answers: string[] = [];
  page.on("response", (response) => {
    if (response.url().startsWith(`${baseURL}/api/`)) {
      void response.text().then(
        (text) => answers.push(text),
        () => undefined,
      );
    }
  });
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

  // The note, previewed as typed; its link and mention go as plain text.
  const note = dialog.getByLabel("Note", { exact: true });
  await note.fill("Please check the [hero](https://evil.test)\n@everyone");
  await expect(dialog.getByTestId("clickup-note-left")).toHaveText("948 left");

  // The preview: first Squint's message, then the link you paste and the card it shows.
  const message = dialog.getByTestId("clickup-preview-message");
  await expect(message.getByTestId("clickup-preview-project")).toHaveText(
    new RegExp(`^\\S.* ${SENT_YOU}$`),
  );
  await expect(message.getByTestId("clickup-preview-note")).toHaveText(
    "Please check the [hero](https://evil.test)\n@everyone",
  );
  await expect(message.getByTestId("clickup-preview-assignee")).toHaveText(
    `Assigned to ${ANA?.username}`,
  );
  await expect(message.getByTestId("clickup-preview-url")).toHaveCount(0);
  const paste = dialog.getByTestId("clickup-preview-paste");
  await expect(paste.getByTestId("clickup-preview-url")).toHaveText(
    new RegExp(`^https?://[^/]+/p/${projectId}$`),
  );
  const card = paste.getByTestId("clickup-preview-card");
  await expect(card).toHaveAttribute("data-state", "ready");
  await expect(card.getByRole("img")).toHaveAttribute(
    "src",
    new RegExp(`/p/${projectId}/opengraph-image$`),
  );
  await expect(dialog.getByTestId("clickup-preview").getByRole("link")).toHaveCount(0);

  // One click: the channel opens in a new tab, the link is copied, the message is posted.
  await expect(dialog.getByTestId("clickup-send")).toHaveText("Copy link & open ClickUp");
  const tab = await sendAndOpen(context, dialog);
  expect(tab.url()).toBe(channelUrl("design-review"));
  await page.bringToFront();
  await expect(dialog).toHaveAccessibleName("One step left: paste the link");
  await expect(dialog).toContainText("ClickUp opened in a new tab on #design-review.");
  const done = dialog.getByTestId("clickup-done");
  // The track: message posted, link copied, the paste that's left; then the paste, shown.
  await expect(done.getByTestId("clickup-done-message")).toHaveAttribute("data-tone", "done");
  await expect(done.getByTestId("clickup-done-message")).toHaveText("Message posted#design-review");
  await expect(done.getByTestId("clickup-done-assignee")).toHaveText(
    `${ANA?.username} is assigned and gets a ClickUp notification.`,
  );
  await expect(done.getByTestId("clickup-done-link")).toHaveAttribute("data-tone", "done");
  await expect(done.getByTestId("clickup-done-link")).toHaveText(
    "Link copied" + "To your clipboard",
  );
  await expect(done.getByTestId("clickup-done-paste")).toHaveAttribute("data-tone", "current");
  const how = done.getByTestId("clickup-done-how");
  await expect(how.getByRole("heading")).toHaveText("Paste it in #design-review and press Enter");
  await expect(how.getByTestId("clickup-preview-card")).toHaveAttribute("data-state", "ready");
  await expect(dialog.getByTestId("clickup-done-close")).toBeFocused();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${baseURL}/p/${projectId}`,
  );

  const [posted, ...others] = await stubMessages();
  expect(others).toEqual([]);
  expect(posted?.channelId).toBe("6-901-2");
  expect(posted?.body).toMatchObject({
    type: "message",
    content_format: "text/md",
    assignee: String(ANA?.id),
  });
  expect(posted?.body).not.toHaveProperty("followers");
  const [title, body, ...rest] = posted?.body.content.split("\n\n") ?? [];
  expect(title).toMatch(TITLE);
  expect(body).toBe("Please check the \\[hero\\]\\(https\\:\\/\\/evil\\.test\\)\\\n\\@everyone");
  // No project name, link or footer: the member pastes the link under it, so ClickUp shows its card.
  expect(rest).toEqual([]);
  expect(posted?.body.content).not.toContain(PROJECT);
  expect(posted?.body.content).not.toContain(`/p/${projectId}`);

  // Copy link again says so; Open ClickUp again opens the channel once more.
  await page.evaluate(() => navigator.clipboard.writeText(""));
  await dialog.getByTestId("clickup-copy-again").click();
  await expect(dialog.getByTestId("clickup-copy-again")).toHaveText("Link copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${baseURL}/p/${projectId}`,
  );
  const [again] = await Promise.all([
    context.waitForEvent("page"),
    dialog.getByTestId("clickup-open-again").click(),
  ]);
  await again.waitForLoadState();
  expect(again.url()).toBe(channelUrl("design-review"));
  await page.bringToFront();
  expect(await stubMessages()).toHaveLength(1);

  // Done closes it. Next time, it starts on the channel last sent to, with a fresh note.
  await dialog.getByTestId("clickup-done-close").click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Send to ClickUp" }).click();
  await expect(
    dialog.getByTestId("clickup-channel").getByRole("radio", { name: "#design-review" }),
  ).toBeChecked();
  await expect(dialog.getByLabel("Note", { exact: true })).toHaveValue("");

  // The token reached no page: not in what Squint answered, nor in the page itself.
  expect(answers.length).toBeGreaterThan(0);
  expect(answers.join("\n")).not.toContain(CLICKUP_STUB.ONE_WORKSPACE);
  expect(await page.content()).not.toContain(CLICKUP_STUB.ONE_WORKSPACE);
});

test("with nobody assigned and no note, the message is the title alone, and a blocked copy leaves the link to copy by hand", async ({
  page,
  context,
  baseURL,
}) => {
  await connectClickUp();
  const projectId = await workspaceProject(page, PROJECT);
  const dialog = await openSendWindow(page, projectId);
  await expect(dialog.getByTestId("clickup-channel-option")).toHaveCount(OPEN_CHANNELS.length);
  await pick(dialog, "clickup-channel", "general", "general");
  // As a browser that won't let the page write the clipboard.
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error("blocked"));
  });
  await sendAndOpen(context, dialog);
  await page.bringToFront();

  const done = dialog.getByTestId("clickup-done");
  await expect(done.getByTestId("clickup-done-message")).toHaveText("Message posted#general");
  await expect(done.getByTestId("clickup-done-assignee")).toHaveCount(0);
  await expect(done.getByTestId("clickup-done-link")).toHaveAttribute("data-tone", "failed");
  const problem = done.getByTestId("clickup-done-copy-problem");
  await expect(problem).toContainText("Copy the link to paste it");
  await expect(problem.getByLabel("Project link")).toHaveValue(`${baseURL}/p/${projectId}`);

  const [posted] = await stubMessages();
  expect(posted?.body).not.toHaveProperty("assignee");
  expect(posted?.body.content).toMatch(TITLE);
});

test("a message ClickUp refuses says what ClickUp said, and Try again posts it once more", async ({
  page,
  context,
}) => {
  await connectClickUp();
  const dialog = await openSendWindow(page, await workspaceProject(page, PROJECT));
  await expect(dialog.getByTestId("clickup-channel-option")).toHaveCount(OPEN_CHANNELS.length);
  await pick(dialog, "clickup-channel", "bugs", "bugs");
  await failStubPosts(1, "Message content is too long");
  await sendAndOpen(context, dialog);
  await page.bringToFront();

  const message = dialog.getByTestId("clickup-done-message");
  const problem = dialog.getByTestId("clickup-done-post-problem");
  await expect(message).toHaveAttribute("data-tone", "failed");
  await expect(problem.getByRole("alert")).toHaveText(
    "ClickUp didn't take the message. It said: “Message content is too long”",
  );
  // The link was still copied, so it can still be pasted.
  await expect(dialog.getByTestId("clickup-done-link")).toHaveAttribute("data-tone", "done");
  expect(await stubMessages()).toEqual([]);

  const pages = context.pages().length;
  await problem.getByRole("button", { name: "Try again" }).click();
  await expect(message).toHaveAttribute("data-tone", "done");
  await expect(message).toHaveText("Message posted#bugs");
  await expect(problem).toHaveCount(0);
  expect(await stubMessages()).toHaveLength(1);
  // Only the message again: no second tab.
  expect(context.pages()).toHaveLength(pages);
});

test("Send asks for a channel first, and nothing goes or opens", async ({ page, context }) => {
  await connectClickUp();
  const dialog = await openSendWindow(page, await workspaceProject(page, PROJECT));
  await expect(dialog.getByTestId("clickup-channel-option")).toHaveCount(OPEN_CHANNELS.length);
  await dialog.getByTestId("clickup-send").click();
  await expect(dialog.getByText("Pick a channel to send to.")).toBeVisible();
  expect(context.pages()).toHaveLength(1);
  expect(await stubMessages()).toEqual([]);
});

test("Enter in the lists picks without sending", async ({ page, isMobile }) => {
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
  await expect(dialog.getByTestId("clickup-send")).toHaveText("Copy link & open ClickUp");

  // Who's notified, under the assignee's list; Enter picks the first person matching there too.
  const assignee = dialog.getByTestId("clickup-assignee");
  // No hint lines in the window.
  await expect(dialog.getByTestId("clickup-assignee-hint")).toHaveCount(0);
  const assigneeSearch = assignee.getByTestId("clickup-assignee-search");
  await assigneeSearch.fill("ana");
  await assigneeSearch.press("Enter");
  await expect(assignee.getByRole("radio", { name: ANA?.username })).toBeChecked();
  // No followers any more: the assignee is the one person picked.
  await expect(dialog.getByTestId("clickup-followers")).toHaveCount(0);
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);

  await expect(dialog).toBeVisible();
  expect(await stubMessages()).toEqual([]);
});

test("a channel deleted in ClickUp says so, and Pick another channel goes back to a list without it", async ({
  page,
  context,
  isMobile,
}) => {
  await connectClickUp();
  const dialog = await openSendWindow(page, await workspaceProject(page, PROJECT));
  const channel = dialog.getByTestId("clickup-channel");
  await channel.getByTestId("clickup-channel-option").filter({ hasText: "general" }).click();
  await removeStubChannel(channelId("general"));
  await sendAndOpen(context, dialog);
  await page.bringToFront();

  const problem = dialog.getByTestId("clickup-done-post-problem");
  await expect(problem.getByRole("alert")).toHaveText(GONE);
  await problem.getByRole("button", { name: "Pick another channel" }).click();

  await expect(channel.getByRole("alert")).toHaveText(GONE);
  await expect(channelFocus(channel, isMobile)).toBeFocused();
  await expect(channel.getByTestId("clickup-channel-option")).toHaveText(
    OPEN_CHANNELS.filter((name) => name !== "general").map((name) => `#${name}`),
  );
  await expect(channel.getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(dialog.getByTestId("clickup-dialog-body")).toHaveAttribute("data-state", "ready");
  expect(await stubMessages()).toEqual([]);
});

test("a channel the member can't post in says so, and Pick another channel goes back to the list", async ({
  page,
  context,
  isMobile,
}) => {
  await connectClickUp();
  const dialog = await openSendWindow(page, await workspaceProject(page, PROJECT));
  const channel = dialog.getByTestId("clickup-channel");
  await channel.getByTestId("clickup-channel-option").filter({ hasText: "marketing" }).click();
  await forbidStubChannel(channelId("marketing"));
  await sendAndOpen(context, dialog);
  await page.bringToFront();

  const refused =
    "You can't post in #marketing in ClickUp. Pick another channel, or ask a ClickUp admin to add you.";
  const problem = dialog.getByTestId("clickup-done-post-problem");
  await expect(problem.getByRole("alert")).toHaveText(refused);
  // Not a reason to reconnect: the token still works.
  await expect(dialog.getByTestId("clickup-send-blocked")).toHaveCount(0);
  await problem.getByRole("button", { name: "Pick another channel" }).click();
  await expect(channel.getByRole("alert")).toHaveText(refused);
  await expect(channelFocus(channel, isMobile)).toBeFocused();
  await expect(channel.getByRole("radio", { name: "#marketing" })).not.toBeChecked();
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
  context,
}) => {
  await connectClickUp();
  const dialog = await openSendWindow(page, await workspaceProject(page, PROJECT));
  await dialog.getByTestId("clickup-channel-option").filter({ hasText: "general" }).click();
  await revokeClickUpToken(CLICKUP_STUB.ONE_WORKSPACE);
  await sendAndOpen(context, dialog);
  await page.bringToFront();
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
