import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./test";
import { signIn, SIGNED_OUT } from "./auth-fixtures";
import {
  addDisposableMember,
  expireInvite,
  newAddress,
  scheduleOwnDeletion,
  setMemberSwitches,
  setSeatLimit,
  type DisposableAccount,
  type MemberOptions,
} from "./account-db";
import {
  browserAs,
  expectNoSideScroll,
  inviteByApi,
  inviteInUi,
  inviteRow,
  openMembers,
  OWNER,
  row,
  team,
} from "./members-fixtures";
import { addDefaultFolder, DEFAULT_FOLDER } from "./squint-fixtures";

/*
 * The Members section: the People list as the owner, a member with the
 * people switch and any other member see it, removing someone, the owner's
 * permission switches (PR 3); inviting people, pending invites and the
 * Leaving group (PR 4). Every workspace here is made for the test
 * (`createDisposableOwner`), so the e2e owner's never changes. Email is off
 * on the e2e server, so invites are created and their links copied by hand.
 */

test.use({ storageState: SIGNED_OUT });

const REMOVED =
  "You're no longer in a Squint workspace, so you can't sign in. Ask the person who invited you for a new invite.";

const member = (owner: DisposableAccount, label: string, options: MemberOptions) =>
  addDisposableMember(owner, label, options);

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

const toast = (page: Page, text: string | RegExp) =>
  page.getByTestId("toast").filter({ hasText: text });

/**
 * Lets the page read what Copy link wrote (WebKit knows no "clipboard-write":
 * it lets a page write anyway), and records whether each write started inside
 * a click. Playwright's WebKit doesn't hold the clipboard to the tap as Safari
 * does, so that's checked here instead.
 */
async function watchClipboard(page: Page, browserName: string) {
  await page
    .context()
    .grantPermissions(
      browserName === "webkit" ? ["clipboard-read"] : ["clipboard-read", "clipboard-write"],
    );
  await page.evaluate(() => {
    const watch = window as typeof window & { writesInClick?: boolean[] };
    let clicking = false;
    watch.writesInClick = [];
    window.addEventListener("click", () => (clicking = true), { capture: true });
    window.addEventListener("click", () => (clicking = false));
    const write = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = (text) => {
      watch.writesInClick?.push(clicking);
      return write(text);
    };
  });
}

const writesInClick = (page: Page) =>
  page.evaluate(() => (window as typeof window & { writesInClick?: boolean[] }).writesInClick);

// Tagged `@webkit`: Safari and iOS run it too, for Copy link.
test("alone, the owner is told email is off before inviting, then invites, copies and cancels @webkit", async ({
  page,
  baseURL,
  browserName,
}, testInfo) => {
  await team(page, testInfo.project.name, baseURL);
  const cleo = newAddress(testInfo.project.name);
  await openMembers(page);
  const invite = page.getByTestId("invite-card");
  await expect(invite.getByRole("heading", { name: "Invite people" })).toBeVisible();
  await expect(invite.getByTestId("invite-email-off")).toHaveText(
    "Email isn't set up on this site. After you invite someone, copy their link from the list and send it yourself.",
  );
  await expect(invite.getByRole("meter")).toHaveAttribute("aria-valuetext", "1 of 10 seats used");
  await expect(invite.getByTestId("seat-breakdown")).toHaveText("1 person · 0 invited");
  await expect(invite.getByTestId("send-member-invites")).toHaveText("Create invites");
  await expect(invite.getByTestId("send-member-invites")).toHaveAttribute("aria-disabled", "true");
  const empty = page.getByTestId("people-empty");
  await expect(empty).toContainText("Just you so far");
  await expect(empty).toContainText("Invite up to 9 people to review with you.");
  await expect(page.getByTestId("pending-invites")).toHaveCount(0);

  const { results } = await inviteInUi(page, [cleo]);
  await expect(invite.getByTestId("invite-status")).toHaveText(`Invite created for ${cleo}.`);
  await expect(page.getByLabel("Email addresses")).toBeFocused();
  const pending = inviteRow(page, cleo);
  await expect(pending.getByTestId("invite-chip")).toHaveText("Invited");
  await expect(pending.getByTestId("invite-meta")).toHaveText(
    `Invited by ${OWNER} · Expires in 7 days`,
  );
  await expect(pending.getByTestId("invite-not-sent")).toHaveText("Email not sent");
  await expect(invite.getByRole("meter")).toHaveAttribute("aria-valuetext", "2 of 10 seats used");
  await expect(invite.getByTestId("seat-breakdown")).toHaveText("1 person · 1 invited");
  await expect(empty).toHaveCount(0);

  // Copy link, right on the row: written inside the tap, then said in a toast.
  await watchClipboard(page, browserName);
  await pending.getByRole("button", { name: `Copy link for ${cleo}` }).click();
  await expect(toast(page, "Invite link copied.")).toBeVisible();
  expect(await writesInClick(page)).toEqual([true]);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(results[0]?.invite?.link);

  await page.getByRole("button", { name: `Actions for ${cleo}` }).click();
  await expect(page.getByRole("menuitem")).toHaveText([
    "Copy invite link",
    "Renew link",
    "Cancel invite",
  ]);
  await page.getByRole("menuitem", { name: "Cancel invite" }).click();
  await expect(toast(page, `Invite for ${cleo} cancelled.`)).toBeVisible();
  await expect(pending).toHaveCount(0);
  await expect(page.getByTestId("people-count")).toBeFocused();
  await expect(invite.getByRole("meter")).toHaveAttribute("aria-valuetext", "1 of 10 seats used");
  // The link no longer works.
  await page.goto(new URL(copied).pathname);
  await expect(page.getByRole("heading", { name: "This invite was cancelled" })).toBeVisible();
});

test("an address that already has an invite offers to renew it, right under the field", async ({
  page,
  baseURL,
}, testInfo) => {
  await team(page, testInfo.project.name, baseURL);
  const cleo = newAddress(testInfo.project.name);
  const dan = newAddress(testInfo.project.name);
  await inviteByApi(page, cleo);
  await openMembers(page);
  await inviteInUi(page, [cleo, dan]);
  const invite = page.getByTestId("invite-card");
  await expect(invite.getByTestId("invite-status")).toHaveText(
    `Invite created for ${dan}. 1 address wasn't invited: the reason is on its chip.`,
  );
  await expect(invite.getByTestId("invite-chip")).toHaveCount(1);
  await expect(invite.getByTestId("invite-chip")).toHaveAttribute(
    "data-problem",
    "already-invited",
  );
  const already = invite.getByTestId("already-invited");
  await expect(already).toContainText(`${cleo} already has an invite.`);
  await already.getByRole("button", { name: `Renew link for ${cleo}` }).click();
  await expect(toast(page, /^Link renewed\. It works until /)).toBeVisible();
  await expect(invite.getByTestId("invite-chip")).toHaveCount(0);
  await expect(inviteRow(page, dan)).toBeVisible();
});

test("seats run out: a send that no longer fits says so, then the notice replaces the field", async ({
  page,
  baseURL,
}, testInfo) => {
  const { owner } = await team(page, testInfo.project.name, baseURL);
  const a = newAddress(testInfo.project.name);
  const b = newAddress(testInfo.project.name);
  await setSeatLimit(owner.workspaceId, 3);
  await openMembers(page);
  const invite = page.getByTestId("invite-card");
  await expect(invite.getByText("2 seats left")).toBeVisible();
  const field = page.getByLabel("Email addresses");
  for (const address of [a, b]) {
    await field.fill(address);
    await field.press("Enter");
  }
  // A seat goes elsewhere between loading the page and sending.
  await setSeatLimit(owner.workspaceId, 2);
  await page.getByTestId("send-member-invites").click();
  await expect(invite.getByTestId("invite-error")).toHaveText(
    "Nothing was sent. Only 1 seat is left now. Remove 1 address, then send again.",
  );
  await expect(invite.getByTestId("invite-chip")).toHaveCount(2);
  await expect(page.getByTestId("send-member-invites")).toHaveAttribute("aria-disabled", "true");
  await invite.getByRole("button", { name: `Remove ${b}` }).click();
  await expect(invite.getByTestId("invite-error")).toHaveText("");
  await page.getByTestId("send-member-invites").click();
  await expect(invite.getByTestId("invite-status")).toHaveText(`Invite created for ${a}.`);

  const full = invite.getByTestId("seats-full");
  await expect(full).toContainText("All 2 seats are taken.");
  await expect(full).toContainText("cancel an invite or remove someone");
  await expect(invite.getByRole("meter")).toHaveAttribute("aria-valuetext", "2 of 2 seats used");
  await expect(page.getByLabel("Email addresses")).toHaveCount(0);

  // Cancelling the invite frees its seat: the field comes back.
  await page.getByRole("button", { name: `Actions for ${a}` }).click();
  await page.getByRole("menuitem", { name: "Cancel invite" }).click();
  await expect(full).toHaveCount(0);
  await expect(invite.getByText("1 seat left")).toBeVisible();
});

test("a member with the people switch renews and cancels an invite the owner sent", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const { owner } = await team(page, testInfo.project.name, baseURL);
  const manager = await member(owner, testInfo.project.name, {
    name: "Mia Manager",
    permissions: ["people"],
  });
  const cleo = newAddress(testInfo.project.name);
  const dan = newAddress(testInfo.project.name);
  await inviteByApi(page, cleo);
  await expireInvite(owner.workspaceId, cleo);

  const managerPage = await browserAs(browser, manager, baseURL);
  await openMembers(managerPage);
  await expect(managerPage.getByTestId("invite-card")).toBeVisible();
  const pending = inviteRow(managerPage, cleo);
  await expect(pending.getByTestId("invite-chip")).toHaveText("Expired");
  await expect(pending.getByTestId("invite-meta")).toContainText(
    `Invited by ${OWNER} · Expired on`,
  );
  await managerPage.getByRole("button", { name: `Actions for ${cleo}` }).click();
  // An expired invite has no link to copy until it's renewed.
  await expect(managerPage.getByRole("menuitem")).toHaveText(["Renew link", "Cancel invite"]);
  await managerPage.getByRole("menuitem", { name: "Renew link" }).click();
  await expect(toast(managerPage, /^Link renewed\. It works until /)).toBeVisible();
  await expect(pending.getByTestId("invite-chip")).toHaveText("Invited");

  await inviteInUi(managerPage, [dan]);
  await expect(inviteRow(managerPage, dan).getByTestId("invite-meta")).toContainText(
    "Invited by Mia Manager",
  );
  await managerPage.getByRole("button", { name: `Actions for ${cleo}` }).click();
  await managerPage.getByRole("menuitem", { name: "Cancel invite" }).click();
  await expect(toast(managerPage, `Invite for ${cleo} cancelled.`)).toBeVisible();
  await expect(pending).toHaveCount(0);
  // Focus goes to the next row's menu.
  await expect(managerPage.getByRole("button", { name: `Actions for ${dan}` })).toBeFocused();
  await managerPage.context().close();
});

test("a member whose people switch went off is told why, and the page becomes the member view", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const { owner } = await team(page, testInfo.project.name, baseURL);
  const manager = await member(owner, testInfo.project.name, {
    name: "Mia Manager",
    permissions: ["people"],
  });
  const managerPage = await browserAs(browser, manager, baseURL);
  await openMembers(managerPage);
  await expect(managerPage.getByTestId("invite-card")).toBeVisible();
  await setMemberSwitches(manager.email, []);
  await inviteInUi(managerPage, [newAddress(testInfo.project.name)]);
  const line = `You can no longer invite or remove people in ${owner.workspaceName}. Ask ${OWNER} if you need to.`;
  await expect(toast(managerPage, line)).toBeVisible();
  await expect(managerPage.getByTestId("invite-card")).toHaveCount(0);
  await expect(managerPage.getByTestId("people-card")).toContainText(
    `Everyone in ${owner.workspaceName}. To invite someone, ask ${OWNER}.`,
  );
  await expect(row(managerPage, "Mia Manager").getByTestId("own-permission").last()).toHaveText(
    "You can't invite or remove people.",
  );
  await managerPage.context().close();
});

test("someone who deleted their own account is listed as leaving, and holds no seat", async ({
  page,
  baseURL,
}, testInfo) => {
  const { owner } = await team(page, testInfo.project.name, baseURL);
  const lea = await member(owner, testInfo.project.name, { name: "Lea Leaver" });
  await scheduleOwnDeletion(lea.email);
  await openMembers(page);
  await expect(page.getByTestId("people-count")).toHaveText("1 person");
  await expect(page.getByTestId("invite-card").getByRole("meter")).toHaveAttribute(
    "aria-valuetext",
    "1 of 10 seats used",
  );
  const leaving = page.getByTestId("leaving");
  await expect(leaving.getByRole("heading", { name: "Leaving" })).toBeVisible();
  await expect(leaving).toContainText(
    "These people deleted their own account. They don't use a seat.",
  );
  const entry = leaving.getByTestId("leaving-row");
  await expect(entry).toContainText("Lea Leaver");
  await expect(entry).toContainText("Leaving");
  await expect(entry).toContainText(`${lea.email} · Leaves for good on`);
  await expect(entry.getByRole("button")).toHaveCount(0);
});

test("with reduced motion, inviting and cancelling still work, and the page passes axe", async ({
  page,
  baseURL,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await team(page, testInfo.project.name, baseURL);
  const cleo = newAddress(testInfo.project.name);
  await openMembers(page);
  await inviteInUi(page, [cleo]);
  await expect(inviteRow(page, cleo)).toBeVisible();
  // "Just you so far" fades out as the invite lands: axe would read it mid-fade.
  await expect(page.getByTestId("people-empty")).toHaveCount(0);
  // The cards fade in as they scroll into view: checked once both have.
  for (const id of ["invite-card", "people-card"]) {
    await page.getByTestId(id).scrollIntoViewIfNeeded();
    await expect(page.getByTestId(id)).toHaveCSS("opacity", "1");
  }
  const results = await new AxeBuilder({ page })
    .include("[data-testid=members-settings]")
    .analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole("button", { name: `Actions for ${cleo}` }).click();
  await page.getByRole("menuitem", { name: "Cancel invite" }).click();
  await expect(inviteRow(page, cleo)).toHaveCount(0);
});

test("at 375px the invite card and pending invites fit without scrolling sideways", async ({
  page,
  baseURL,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await team(page, testInfo.project.name, baseURL);
  await inviteByApi(page, `a-very-long-address-${newAddress(testInfo.project.name)}`);
  await openMembers(page);
  await expect(page.getByTestId("invite-row")).toHaveCount(1);
  await expectNoSideScroll(page);
});
