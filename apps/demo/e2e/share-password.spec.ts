import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { expect, test } from "./test";
import { SIGNED_OUT } from "./auth-fixtures";
import { E2E_COMPANY } from "./e2e-env";
import {
  mockFrameCheck,
  setLinkPassword,
  shareWorkspaceProject,
  skipReviewGuide,
} from "./squint-fixtures";
import { e2eWorkspaceId } from "./workspace-db";

const PROJECT = "Secret launch";

/** A signed-out browser of its own, past the review guide, that never loads the real site. */
async function guestBrowser(browser: Browser) {
  const context = await browser.newContext({ storageState: SIGNED_OUT });
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

/** The locked page: it says so, and shows nothing of the project. */
async function expectLocked(guest: Page, request: APIRequestContext, token: string) {
  await expect(guest.getByTestId("share-locked")).toBeVisible();
  await expect(
    guest.getByRole("heading", { level: 1, name: "This link needs a password" }),
  ).toBeVisible();
  expect(await guest.content()).not.toContain(PROJECT);
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
  // The preview names the company, never the project.
  const html = await (await request.get(`/s/${token}`)).text();
  expect(html).toContain(`${E2E_COMPANY.name} invited you to review`);
  expect(html).not.toContain(PROJECT);

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
  await expect(guest.getByRole("heading", { level: 1, name: PROJECT })).toBeVisible();
  expect((await request.get(`/api/s/${token}`)).status()).toBe(200);

  // A new password voids the pass at once.
  await setLinkPassword(page, projectId, "second password");
  await guest.reload();
  await expectLocked(guest, request, token);
  expect((await unlock(request, token, "first password")).status()).toBe(401);
  expect((await unlock(request, token, "second password")).status()).toBe(200);
  await guest.reload();
  await expect(guest.getByRole("heading", { level: 1, name: PROJECT })).toBeVisible();

  // Without a password the link opens to anyone again.
  await setLinkPassword(page, projectId, null);
  await context.clearCookies();
  await guest.reload();
  await expect(guest.getByRole("heading", { level: 1, name: PROJECT })).toBeVisible();
  await context.close();
});
