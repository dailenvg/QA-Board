import type { Browser, Locator, Page } from "@playwright/test";
import { AVATAR_FILL } from "../lib/avatar/default-avatar";
import { expect, test } from "./test";
import { addDisposableMember, newAddress, type DisposableAccount } from "./account-db";
import { SIGNED_OUT } from "./auth-fixtures";
import { expectBadgeBottomLeft, expectMark } from "./avatar-fixtures";
import {
  browserAs,
  inviteByApi,
  inviteRow,
  openMembers,
  OWNER,
  row,
  signedOutBrowser,
  team,
} from "./members-fixtures";
import { snapshotPng } from "./sample-snapshot";
import {
  addDefaultFolder,
  createImageProject,
  DEFAULT_FOLDER,
  hideComments,
  postComment,
  showComments,
  skipReviewGuide,
} from "./squint-fixtures";

/*
 * The company badge on the team's avatars (PR 5, 4b.15): in the sidebar, on
 * Members rows, and on team comments in the workspace and on review links,
 * where it reads "on the {Company} team" to screen readers. Never on a
 * client's comment. It hangs bottom left, clear of a default mark's tail.
 * Every workspace here is made for the test.
 */

test.use({ storageState: SIGNED_OUT });

const COMPANY = "Northwind Studio";
const MEMBER = "Mia Reyes";
/** The company icon's side: `BRAND_ICON_SIZE`, drawn small. */
const ICON_PX = 192;
const PHOTO_PX = 128;

const APP_BADGE = /^\/api\/account\/workspace\/icon\?v=[0-9a-f]{16}$/;
const LINK_BADGE = /^\/api\/s\/[A-Za-z0-9_-]+\/brand\/icon\?v=[0-9a-f]{16}$/;
const LINK_PHOTO =
  /^\/api\/s\/[A-Za-z0-9_-]+\/people\/[A-Za-z0-9_-]{22}\/avatar\?v=[A-Za-z0-9_-]{16}$/;

const card = (page: Page, text: string): Locator =>
  page.getByTestId("comment-card").filter({ hasText: text });

/** Stores `bytes` as a PNG through the account API, as the settings pages upload it. */
async function putPng(page: Page, path: string, bytes: Buffer): Promise<void> {
  const response = await page.request.put(path, {
    data: bytes,
    headers: { "content-type": "image/png" },
  });
  expect(response.status()).toBe(200);
}

/** The path and query `image` loads, once it has loaded at `width`. */
async function loaded(image: Locator, width: number): Promise<string> {
  await expect(image).toBeVisible();
  // Lazy-loaded: below a phone's fold, it only loads once scrolled to.
  await image.scrollIntoViewIfNeeded();
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth))
    .toBe(width);
  const src = new URL((await image.getAttribute("src")) ?? "", "http://squint.test");
  return `${src.pathname}${src.search}`;
}

/** The logo's badge in `scope`, drawn: its path and query, matching `shape`. */
async function badgeIn(scope: Locator, shape: RegExp): Promise<string> {
  const src = await loaded(scope.getByTestId("company-badge"), ICON_PX);
  expect(src).toMatch(shape);
  return src;
}

/**
 * Olga's workspace, named and with a logo, and Mia, a member with a photo,
 * signed in on a browser of her own.
 */
async function northwind(page: Page, browser: Browser, baseURL: string | undefined, label: string) {
  const { owner } = await team(page, label, baseURL);
  const renamed = await page.request.patch("/api/account/workspace", {
    data: { name: COMPANY, brandColor: null, senderName: null },
  });
  expect(renamed.status()).toBe(200);
  await putPng(page, "/api/account/workspace/logo", snapshotPng(64, 64));
  const mia = await addDisposableMember(owner, label, { name: MEMBER });
  const miaPage = await browserAs(browser, mia, baseURL);
  await putPng(miaPage, "/api/account/avatar", snapshotPng(PHOTO_PX, PHOTO_PX));
  return { owner, miaPage };
}

/** An image project in `owner`'s workspace with a review link, open in Olga's viewer. */
async function sharedImageProject(page: Page, owner: DisposableAccount) {
  await addDefaultFolder(page, owner.workspaceId);
  await page.goto(`/f/${DEFAULT_FOLDER.id}`);
  await createImageProject(page, "mockup.png");
  const projectId = new URL(page.url()).pathname.split("/").at(-1) ?? "";
  await page.getByTestId("share-button").click();
  const dialog = page.getByTestId("share-dialog");
  const link = (await dialog.getByTestId("copy-share-link").getAttribute("data-url")) ?? "";
  await expect(dialog.getByTestId("share-sync")).toHaveAttribute("data-sync", "synced");
  await page.keyboard.press("Escape");
  return { projectId, linkPath: new URL(link).pathname };
}

test("a member's comment carries their photo and the company badge, in the workspace and on the review link", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const { owner, miaPage } = await northwind(page, browser, baseURL, testInfo.project.name);
  const { projectId, linkPath } = await sharedImageProject(page, owner);

  await miaPage.goto(`/p/${projectId}`);
  await expect(miaPage.getByRole("img", { name: /the image under review/ })).toBeVisible();
  await hideComments(miaPage);
  await postComment(miaPage, "Mia's note", { x: 220, y: 180 });
  // Mia's own comment carries her photo as soon as she posts it, without another read.
  await showComments(miaPage);
  const posted = card(miaPage, "Mia's note");
  await loaded(posted.getByTestId("comment-avatar"), PHOTO_PX);
  await badgeIn(posted, APP_BADGE);
  // The workspace: Olga sees Mia's photo with the badge; the badge is decorative there.
  await page.reload();
  await showComments(page);
  const inApp = card(page, "Mia's note");
  await loaded(inApp.getByTestId("comment-avatar"), PHOTO_PX);
  await badgeIn(inApp, APP_BADGE);
  await expectBadgeBottomLeft(
    inApp.getByTestId("company-badge"),
    inApp.getByTestId("comment-avatar"),
  );
  await expect(inApp.getByRole("button", { name: /team/ })).toHaveCount(0);
  if (!testInfo.project.use.hasTouch) {
    // Hovered, the card tints and the cut-out ring tints with it: no halo of the resting color.
    const ring = inApp.getByTestId("company-badge").locator("..");
    const rest = await inApp.evaluate((node) => getComputedStyle(node).backgroundColor);
    await inApp.locator("[data-card-select]").hover();
    await expect
      .poll(async () => {
        const tint = await inApp.evaluate((node) => getComputedStyle(node).backgroundColor);
        const shadow = await ring.evaluate((node) => getComputedStyle(node).boxShadow);
        return tint !== rest && shadow.includes(`${tint} 0px 0px 0px 2px`);
      })
      .toBe(true);
    await page.mouse.move(0, 0);
  }

  // The review link: the same, through the link's own URLs, and said in words.
  const client = await signedOutBrowser(browser);
  await skipReviewGuide(client);
  await expect(async () => {
    await client.goto(linkPath);
    await showComments(client);
    await expect(card(client, "Mia's note")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  const onLink = card(client, "Mia's note");
  expect(await loaded(onLink.getByTestId("comment-avatar"), PHOTO_PX)).toMatch(LINK_PHOTO);
  await badgeIn(onLink, LINK_BADGE);
  await expect(
    // Chromium's name computation spaces out sr-only text: "Mia Reyes , on the … team".
    onLink.getByRole("button", { name: new RegExp(`by ${MEMBER}\\s*, on the ${COMPANY} team`) }),
  ).toBeVisible();

  // A client's comment: the person mark, no badge, and nothing said about a team.
  await hideComments(client);
  await postComment(client, "Client's note", { x: 120, y: 90 }, "Cleo Client");
  await showComments(client);
  const clientCard = card(client, "Client's note");
  await expectMark(clientCard.getByTestId("comment-initials"), "person", AVATAR_FILL);
  await expect(clientCard.getByTestId("company-badge")).toHaveCount(0);
  await expect(clientCard.getByRole("button", { name: /team/ })).toHaveCount(0);

  // Pulled into the workspace, it keeps its Client chip and still gets no badge.
  await expect(async () => {
    await page.reload();
    await showComments(page);
    await expect(card(page, "Client's note")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  const pulled = card(page, "Client's note");
  await expect(pulled.getByText("Client", { exact: true })).toBeVisible();
  await expect(pulled.getByTestId("comment-initials")).toBeVisible();
  await expect(pulled.getByTestId("company-badge")).toHaveCount(0);

  // Without the logo, the badge is the company's default, drawn in place on both sides.
  const removed = await page.request.delete("/api/account/workspace/logo", { data: {} });
  expect(removed.status()).toBe(200);
  await client.reload();
  await showComments(client);
  const linkDefault = card(client, "Mia's note").getByTestId("company-badge");
  await expectMark(linkDefault, "company", AVATAR_FILL);
  await page.reload();
  await showComments(page);
  const appDefault = card(page, "Mia's note").getByTestId("company-badge");
  await expectMark(appDefault, "company", AVATAR_FILL);

  await client.context().close();
  await miaPage.context().close();
});

test("the sidebar and Members rows carry the badge bottom left, the owner's too; invite rows don't", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const { miaPage } = await northwind(page, browser, baseURL, testInfo.project.name);
  const pending = newAddress(testInfo.project.name);
  await inviteByApi(page, pending);
  await openMembers(page);

  const sidebar = page.getByTestId("sidebar-account");
  await badgeIn(sidebar, APP_BADGE);
  // Olga has no photo: her default mark, head and shoulders beside the badge.
  const olga = sidebar.getByTestId("account-initials");
  await expectMark(olga, "person", AVATAR_FILL);
  await expect(olga).toHaveText("");
  await expectBadgeBottomLeft(sidebar.getByTestId("company-badge"), olga);
  await badgeIn(row(page, OWNER), APP_BADGE);
  await expectMark(row(page, OWNER).getByTestId("member-initials"), "person", AVATAR_FILL);
  await badgeIn(row(page, MEMBER), APP_BADGE);
  const miaPhoto = row(page, MEMBER).getByTestId("member-avatar");
  await loaded(miaPhoto, PHOTO_PX);
  await expectBadgeBottomLeft(row(page, MEMBER).getByTestId("company-badge"), miaPhoto);
  await expect(inviteRow(page, pending)).toBeVisible();
  await expect(inviteRow(page, pending).getByTestId("company-badge")).toHaveCount(0);
  await miaPage.context().close();
});

test("the badge is cut out of the avatar in the card's color, light and dark", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const { miaPage } = await northwind(page, browser, baseURL, testInfo.project.name);
  const cardColors: string[] = [];
  for (const theme of ["light", "dark"] as const) {
    await page.goto("/account/members");
    await page.evaluate((value) => localStorage.setItem("squint:theme", value), theme);
    await page.reload();
    expect((await page.locator("html").getAttribute("data-theme")) === "dark").toBe(
      theme === "dark",
    );
    const people = await openMembers(page);
    const mia = row(page, MEMBER);
    await badgeIn(mia, APP_BADGE);
    const surface = await people.evaluate((node) => getComputedStyle(node).backgroundColor);
    const ring = await mia
      .getByTestId("company-badge")
      .locator("..")
      .evaluate((node) => getComputedStyle(node).boxShadow);
    expect(ring, `${theme} cut-out ring`).toContain(`${surface} 0px 0px 0px 2px`);
    cardColors.push(surface);
    await testInfo.attach(`badge-${theme}`, {
      body: await mia.locator(":scope > div").first().screenshot(),
      contentType: "image/png",
    });
  }
  expect(cardColors[0]).not.toBe(cardColors[1]);
  await miaPage.context().close();
});

test("a badge that won't load is left out, and the avatar stays", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const { owner, miaPage } = await northwind(page, browser, baseURL, testInfo.project.name);
  const { projectId } = await sharedImageProject(page, owner);
  await miaPage.route("**/api/account/workspace/icon**", (route) =>
    route.fulfill({ status: 500, body: "" }),
  );
  await miaPage.goto(`/p/${projectId}`);
  await expect(miaPage.getByRole("img", { name: /the image under review/ })).toBeVisible();
  await hideComments(miaPage);
  await postComment(miaPage, "Mia's note", { x: 220, y: 180 });
  await miaPage.reload();
  await showComments(miaPage);
  const note = card(miaPage, "Mia's note");
  await loaded(note.getByTestId("comment-avatar"), PHOTO_PX);
  await expect(note.getByTestId("company-badge")).toHaveCount(0);

  await openMembers(miaPage);
  await loaded(row(miaPage, MEMBER).getByTestId("member-avatar"), PHOTO_PX);
  await expect(row(miaPage, MEMBER).getByTestId("company-badge")).toHaveCount(0);
  await expect(miaPage.getByTestId("sidebar-account").getByTestId("account-avatar")).toBeVisible();
  await expect(miaPage.getByTestId("sidebar-account").getByTestId("company-badge")).toHaveCount(0);
  await miaPage.context().close();
});
