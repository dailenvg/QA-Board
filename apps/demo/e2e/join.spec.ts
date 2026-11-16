import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./test";
import { signIn, SIGNED_OUT } from "./auth-fixtures";
import {
  addDisposableMember,
  createLoneAccount,
  expireInvite,
  newAddress,
  type DisposableAccount,
} from "./account-db";
import {
  browserAs,
  expectNoSideScroll,
  inviteByApi,
  inviteInUi,
  inviteRow,
  joinPath,
  openMembers,
  OWNER,
  row,
  signedOutBrowser,
  team,
} from "./members-fixtures";
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
 * An invite's page, `/join/<token>` (PR 4): every state it can open on, the
 * form a new person joins with (hydrated, and as a plain form post), and
 * what joining leads to. Every workspace here is made for the test.
 */

test.use({ storageState: SIGNED_OUT });

const PASSWORD = "a new member's password";

const title = (page: Page, text: string) => page.getByRole("heading", { level: 1, name: text });

const card = (page: Page, text: string): Locator =>
  page.getByTestId("comment-card").filter({ hasText: text });

/** Fills the new-person form and presses Join. */
async function fillJoinForm(page: Page, name: string, again = PASSWORD) {
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Password, again").fill(again);
  await page.getByTestId("join-submit").click();
}

/** An image project in the owner's workspace, open in their viewer: its id. */
async function imageProject(page: Page, owner: DisposableAccount): Promise<string> {
  await addDefaultFolder(page, owner.workspaceId);
  await page.goto(`/f/${DEFAULT_FOLDER.id}`);
  await createImageProject(page, "mockup.png");
  return new URL(page.url()).pathname.split("/").at(-1) ?? "";
}

test("a new person joins with a copied link, is welcomed, and their comment carries their name", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const { owner } = await team(page, testInfo.project.name, baseURL);
  const projectId = await imageProject(page, owner);
  const nia = newAddress(testInfo.project.name);
  await openMembers(page);
  const { results } = await inviteInUi(page, [nia]);
  const path = joinPath(results[0]?.invite?.link ?? "");

  const niaPage = await signedOutBrowser(browser);
  await niaPage.goto(path);
  await expect(title(niaPage, `Join ${owner.workspaceName} on Squint`)).toBeVisible();
  await expect(niaPage.getByTestId("auth-brand-name")).toHaveText(owner.workspaceName);
  await expect(niaPage.getByText(`${OWNER} invited you to review with them.`)).toBeVisible();
  await expect(niaPage.getByTestId("join-email")).toHaveText(nia);
  await expect(niaPage.getByLabel("Name")).toBeFocused();
  // Field rules on blur: too short a password says so before anything is sent.
  await niaPage.getByLabel("Password", { exact: true }).fill("short");
  await niaPage.getByLabel("Password, again").focus();
  await expect(niaPage.getByText("Use at least 12 characters.")).toBeVisible();
  await fillJoinForm(niaPage, "Nia New");

  await expect(niaPage).toHaveURL(/\/$/);
  await expect(
    niaPage.getByTestId("toast").filter({ hasText: `You've joined ${owner.workspaceName}.` }),
  ).toBeVisible();

  await niaPage.goto(`/p/${projectId}`);
  await expect(niaPage.getByRole("img", { name: /the image under review/ })).toBeVisible();
  await hideComments(niaPage);
  await postComment(niaPage, "Member note", { x: 200, y: 160 });
  await showComments(niaPage);
  await expect(card(niaPage, "Member note")).toContainText("Nia New");

  await page.goto(`/p/${projectId}`);
  await showComments(page);
  await expect(card(page, "Member note")).toContainText("Nia New");
  await openMembers(page);
  await expect(row(page, "Nia New")).toContainText(nia);
  await expect(inviteRow(page, nia)).toHaveCount(0);
  await niaPage.context().close();
});

test("signed in as someone else: the page says so, and signing out continues to the invite", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const { owner } = await team(page, testInfo.project.name, baseURL);
  const cleo = newAddress(testInfo.project.name);
  const path = await inviteByApi(page, cleo);
  const other = await addDisposableMember(owner, testInfo.project.name, { name: "Ben Ito" });
  const benPage = await browserAs(browser, other, baseURL);
  await benPage.goto(path);
  await expect(title(benPage, "This invite is for someone else")).toBeVisible();
  await expect(
    benPage.getByText(`You're signed in as ${other.email}, but this invite is for ${cleo}.`),
  ).toBeVisible();
  await expect(benPage.getByTestId("join-stay")).toHaveText("Stay signed in");
  await benPage.getByRole("button", { name: "Sign out and continue" }).click();
  await expect(benPage).toHaveURL(new RegExp(`${path}$`));
  await expect(title(benPage, `Join ${owner.workspaceName} on Squint`)).toBeVisible();
  await benPage.context().close();
});

test("an address with an account signs in first, then joins with one button", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const { owner } = await team(page, testInfo.project.name, baseURL);
  const cleo = newAddress(testInfo.project.name);
  await createLoneAccount(cleo, PASSWORD);
  const path = await inviteByApi(page, cleo);
  const cleoPage = await signedOutBrowser(browser);
  await cleoPage.goto(path);
  await expect(title(cleoPage, `Sign in to join ${owner.workspaceName}`)).toBeVisible();
  await expect(cleoPage.getByText(`This invite is for ${cleo}.`)).toBeVisible();
  await expect(cleoPage.getByRole("link", { name: "Forgot your password?" })).toBeVisible();
  await cleoPage.getByTestId("join-sign-in").click();
  await signIn(cleoPage, { email: cleo, password: PASSWORD });
  await expect(title(cleoPage, `Join ${owner.workspaceName}`)).toBeVisible();
  await cleoPage.getByRole("button", { name: `Join ${owner.workspaceName}` }).click();
  await expect(cleoPage).toHaveURL(/\/$/);
  await expect(
    cleoPage.getByTestId("toast").filter({ hasText: `You've joined ${owner.workspaceName}.` }),
  ).toBeVisible();
  // Opened again, the used link goes straight to the Overview.
  await cleoPage.goto(path);
  await expect(cleoPage).toHaveURL(/\/$/);
  await cleoPage.context().close();
});

test("expired, cancelled, used and unknown links each say so, naming whom to ask", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const { owner } = await team(page, testInfo.project.name, baseURL);
  const late = newAddress(testInfo.project.name);
  const gone = newAddress(testInfo.project.name);
  const used = newAddress(testInfo.project.name);
  const expiredPath = await inviteByApi(page, late);
  await expireInvite(owner.workspaceId, late);
  const cancelledPath = await inviteByApi(page, gone);
  await openMembers(page);
  await page.getByRole("button", { name: `Actions for ${gone}` }).click();
  await page.getByRole("menuitem", { name: "Cancel invite" }).click();
  await expect(inviteRow(page, gone)).toHaveCount(0);
  const usedPath = await inviteByApi(page, used);

  const visitor = await signedOutBrowser(browser);
  await visitor.goto(usedPath);
  await fillJoinForm(visitor, "Uma Used");
  await expect(visitor).toHaveURL(/\/$/);
  await visitor.context().clearCookies();

  const ask = `Ask ${OWNER} at ${owner.workspaceName} for a new one.`;
  await visitor.goto(expiredPath);
  await expect(title(visitor, "This invite has expired")).toBeVisible();
  await expect(visitor.getByText(ask)).toBeVisible();
  await visitor.goto(cancelledPath);
  await expect(title(visitor, "This invite was cancelled")).toBeVisible();
  await expect(visitor.getByText(ask)).toBeVisible();
  await visitor.goto(usedPath);
  await expect(title(visitor, "This invite has been used")).toBeVisible();
  await expect(
    visitor.getByText(`If that wasn't you, ask ${OWNER} at ${owner.workspaceName} for a new one.`),
  ).toBeVisible();
  await expect(visitor.getByTestId("join-sign-in")).toHaveText("Sign in");
  await visitor.goto(`/join/${"x".repeat(43)}`);
  await expect(title(visitor, "This invite link doesn't work")).toBeVisible();
  await expect(visitor.getByTestId("auth-brand")).toHaveCount(0);
  await expect(visitor.getByRole("link", { name: "Go to sign in" })).toBeVisible();
  await visitor.context().close();
});

test("a link that stops working while the form is open swaps to why, with focus on it", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  await team(page, testInfo.project.name, baseURL);
  const cleo = newAddress(testInfo.project.name);
  const path = await inviteByApi(page, cleo);
  const cleoPage = await signedOutBrowser(browser);
  await cleoPage.goto(path);
  await expect(cleoPage.getByTestId("join-form")).toBeVisible();

  await openMembers(page);
  await page.getByRole("button", { name: `Actions for ${cleo}` }).click();
  await page.getByRole("menuitem", { name: "Cancel invite" }).click();
  await expect(inviteRow(page, cleo)).toHaveCount(0);

  await fillJoinForm(cleoPage, "Cleo Late");
  const heading = title(cleoPage, "This invite was cancelled");
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await cleoPage.context().close();
});

test("before the page hydrates, the form still posts, and comes back with why", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  await team(page, testInfo.project.name, baseURL);
  const cleo = newAddress(testInfo.project.name);
  const path = await inviteByApi(page, cleo);
  const context = await browser.newContext({ storageState: SIGNED_OUT, javaScriptEnabled: false });
  const plain = await context.newPage();
  await plain.goto(path);
  await plain.getByLabel("Name").fill("Cleo Plain");
  await plain.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await plain.getByLabel("Password, again").fill("not the same password");
  await plain.getByTestId("join-submit").click();
  await expect(plain).toHaveURL(new RegExp(`${path}\\?error=mismatch$`));
  await expect(plain.getByTestId("join-error")).toHaveText(
    "The two passwords didn't match. Type them again.",
  );
  await plain.getByLabel("Name").fill("Cleo Plain");
  await plain.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await plain.getByLabel("Password, again").fill(PASSWORD);
  await plain.getByTestId("join-submit").click();
  await expect(plain).toHaveURL(/\/\?welcome=joined$/);
  await context.close();
});

test("the join page fits a 375px screen in every state with a long address", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const { owner } = await team(page, testInfo.project.name, baseURL);
  const cleo = `a-really-quite-long-local-part-${newAddress(testInfo.project.name)}`;
  const path = await inviteByApi(page, cleo);
  const narrow = await signedOutBrowser(browser);
  await narrow.setViewportSize({ width: 375, height: 812 });
  await narrow.goto(path);
  await expect(narrow.getByTestId("join-form")).toBeVisible();
  await expectNoSideScroll(narrow);
  const other = await addDisposableMember(owner, testInfo.project.name, { name: "Ben Ito" });
  const benNarrow = await browserAs(browser, other, baseURL);
  await benNarrow.setViewportSize({ width: 375, height: 812 });
  await benNarrow.goto(path);
  await expect(title(benNarrow, "This invite is for someone else")).toBeVisible();
  await expectNoSideScroll(benNarrow);
  const buttons = [
    benNarrow.getByRole("button", { name: "Sign out and continue" }),
    benNarrow.getByRole("link", { name: "Stay signed in" }),
  ];
  for (const button of buttons) {
    await expect.poll(async () => (await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  // Stacked: the second sits under the first.
  const [first, second] = await Promise.all(buttons.map((button) => button.boundingBox()));
  expect((second?.y ?? 0) >= (first?.y ?? 0) + (first?.height ?? 0)).toBe(true);
  await narrow.context().close();
  await benNarrow.context().close();
});

test("two members comment on one shared project: each sees the other's, and so does the client", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const { owner } = await team(page, testInfo.project.name, baseURL);
  const ben = await addDisposableMember(owner, testInfo.project.name, { name: "Ben Ito" });
  const projectId = await imageProject(page, owner);
  await page.getByTestId("share-button").click();
  const dialog = page.getByTestId("share-dialog");
  const link = (await dialog.getByTestId("copy-share-link").getAttribute("data-url")) ?? "";
  await expect(dialog.getByTestId("share-sync")).toHaveAttribute("data-sync", "synced");
  await page.keyboard.press("Escape");

  const benPage = await browserAs(browser, ben, baseURL);
  await benPage.goto(`/p/${projectId}`);
  await expect(benPage.getByRole("img", { name: /the image under review/ })).toBeVisible();
  await hideComments(benPage);
  await postComment(benPage, "Ben's note", { x: 220, y: 180 });
  await hideComments(page);
  await postComment(page, "Olga's note", { x: 120, y: 90 });

  await page.reload();
  await showComments(page);
  await expect(card(page, "Ben's note")).toContainText("Ben Ito");
  await benPage.reload();
  await showComments(benPage);
  await expect(card(benPage, "Olga's note")).toContainText(OWNER);

  const client = await signedOutBrowser(browser);
  await skipReviewGuide(client);
  await expect(async () => {
    await client.goto(new URL(link).pathname);
    await showComments(client);
    await expect(card(client, "Ben's note")).toBeVisible({ timeout: 2_000 });
    await expect(card(client, "Olga's note")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await benPage.context().close();
  await client.context().close();
});
