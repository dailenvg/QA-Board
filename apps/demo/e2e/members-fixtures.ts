import type { Browser, Page } from "@playwright/test";
import { expect } from "./test";
import { sessionCookie, SIGNED_OUT } from "./auth-fixtures";
import { createDisposableOwner, nameAccount, type DisposableAccount } from "./account-db";

/*
 * What the Members and join specs share: a workspace of the test's own,
 * browsers signed in as its people, and inviting someone into it. Every
 * workspace here is made for the test, so the e2e owner's never changes.
 */

export const OWNER = "Olga Owner";

/** A browser of its own, signed in as `account`. */
export async function browserAs(
  browser: Browser,
  account: { email: string },
  baseURL: string | undefined,
): Promise<Page> {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  await context.addCookies([await sessionCookie(account.email, baseURL ?? "")]);
  return context.newPage();
}

/** A browser of its own, signed out. */
export async function signedOutBrowser(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  return context.newPage();
}

export interface Team {
  owner: DisposableAccount;
  ownerPage: Page;
}

/** A workspace owned by Olga, signed in on `page`. */
export async function team(page: Page, label: string, baseURL: string | undefined): Promise<Team> {
  const owner = await createDisposableOwner(label);
  await nameAccount(owner.email, OWNER);
  await page.context().addCookies([await sessionCookie(owner.email, baseURL ?? "")]);
  return { owner, ownerPage: page };
}

export async function openMembers(page: Page) {
  await page.goto("/account/members");
  const card = page.getByTestId("people-card");
  await expect(card).toBeVisible();
  return card;
}

/** A person's row in card B, by the name it shows. */
export const row = (page: Page, name: string) =>
  page.getByTestId("member-row").filter({ has: page.getByTestId("member-name").getByText(name) });

/** A pending invite's row in card B, by its address. */
export const inviteRow = (page: Page, email: string) =>
  page.getByTestId("invite-row").filter({ has: page.getByTestId("invite-email").getByText(email) });

/** An invite link's path (`/join/<token>`): the e2e server's own origin isn't the link's. */
export const joinPath = (link: string) => new URL(link).pathname;

interface InviteAnswer {
  results: Array<{ email: string; ok: boolean; error?: string; invite?: { link: string } }>;
}

/**
 * Types `emails` into card A's field and sends them (email is off in e2e:
 * "Create invite"). Answers the POST's results, for the links.
 */
export async function inviteInUi(page: Page, emails: readonly string[]): Promise<InviteAnswer> {
  const field = page.getByLabel("Email addresses");
  for (const email of emails) {
    await field.fill(email);
    await field.press("Enter");
  }
  const answer = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/account/members/invites") &&
      response.request().method() === "POST",
  );
  await page.getByTestId("send-member-invites").click();
  return (await (await answer).json()) as InviteAnswer;
}

/** Invites `email` through the API as the browser's account; answers the join link's path. */
export async function inviteByApi(page: Page, email: string): Promise<string> {
  const response = await page.request.post("/api/account/members/invites", {
    data: { emails: [email] },
  });
  expect(response.status()).toBe(200);
  const { results } = (await response.json()) as InviteAnswer;
  const link = results[0]?.invite?.link;
  if (!link) throw new Error(`not invited: ${JSON.stringify(results)}`);
  return joinPath(link);
}

/** No horizontal scroll: the page is no wider than its viewport. */
export async function expectNoSideScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}
