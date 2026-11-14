import { randomUUID } from "node:crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./test";
import { MAIN_PREVIEW, TEAM_REVIEW_CARD_ALT, teamReviewPreview } from "../lib/link-preview";
import { signIn, SIGNED_OUT } from "./auth-fixtures";
import { E2E_COMPANY } from "./e2e-env";
import { snapshotPng } from "./sample-snapshot";
import { addDefaultFolder, DEFAULT_FOLDER, mockFrameCheck } from "./squint-fixtures";
import { expectCard, expectLargeCard, iconLinks, tag, unfurl } from "./unfurl-fixtures";
import { brandWorkspace, e2eWorkspaceId } from "./workspace-db";

/**
 * A project's own link (`/p/<id>`): its team opens the viewer signed in;
 * anyone else who has it sees whose project it is and Sign in, and a chat
 * app unfurls it as the company's card. Nothing else of the project, and an
 * id that doesn't open (unknown, in the trash, archived) says no more than a
 * made-up one.
 */

const PROJECT = "Spring launch";

/** A website project in DEFAULT_FOLDER, made through the server, with a random id as the app makes. */
async function workspaceProject(page: Page, name: string): Promise<string> {
  await addDefaultFolder(page);
  const id = randomUUID();
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

/** Moves a project to the trash, as its menu does. Writes must say they're JSON, even without a body. */
async function trash(page: Page, id: string): Promise<void> {
  const response = await page.request.delete(await projectApi(id), {
    headers: { "content-type": "application/json" },
  });
  expect(response.ok()).toBe(true);
}

/** `path` under the project's API route. */
async function projectApi(id: string, path = ""): Promise<string> {
  return `/api/w/${await e2eWorkspaceId()}/projects/${id}${path}`;
}

/** Squint's main card, as /opengraph-image serves it. */
async function mainCard(request: APIRequestContext): Promise<Buffer> {
  return expectCard(request, "/opengraph-image");
}

/** Checks `/p/<id>` unfurls as Squint, naming nothing, and its own card routes answer Squint's card. */
async function expectSquintPreview(request: APIRequestContext, id: string, hidden: string[]) {
  const tags = await unfurl(request, `/p/${id}`);
  expect(tag(tags, "og:title")).toBe(MAIN_PREVIEW.title);
  expect(tag(tags, "og:site_name")).toBe("Squint");
  expect(new URL(tag(tags, "og:image")).pathname).toBe("/opengraph-image");
  for (const [key, value] of tags) {
    for (const word of hidden) expect(value, key).not.toContain(word);
  }
  for (const href of (await iconLinks(request, `/p/${id}`)).values()) {
    expect(href, "Squint's own icon").not.toContain(id);
  }
  const main = await mainCard(request);
  for (const image of ["opengraph-image", "twitter-image"]) {
    const card = await expectCard(request, `/p/${id}/${image}`);
    expect(card.equals(main), `/p/${id}/${image} is Squint's main card`).toBe(true);
  }
  expect((await request.get(`/api/p/${id}/brand/icon`)).status()).toBe(404);
}

test("signed out, a project's link unfurls as its company's card", async ({
  page,
  playwright,
  baseURL,
}) => {
  const id = await workspaceProject(page, PROJECT);
  await brandWorkspace({ color: "#e03b9d", logo: snapshotPng(64, 64) });
  // No session: an unfurler, or anyone the link was passed to.
  const anonymous = await playwright.request.newContext({ baseURL, storageState: SIGNED_OUT });

  const tags = await unfurl(anonymous, `/p/${id}`);
  const copy = teamReviewPreview({ company: E2E_COMPANY.name, project: PROJECT });
  expect(tag(tags, "og:title")).toBe(copy.title);
  expect(tag(tags, "og:description")).toBe(copy.description);
  expect(tag(tags, "twitter:title")).toBe(copy.title);
  expect(tag(tags, "og:site_name")).toBe(E2E_COMPANY.name);
  expect(tag(tags, "og:image:alt")).toBe(TEAM_REVIEW_CARD_ALT);
  expect(tag(tags, "robots")).toContain("noindex");
  expect(tag(tags, "referrer")).toBe("no-referrer");
  expect(tags.has("og:url"), "no og:url").toBe(false);
  // The project's own card, by its id alone; not Squint's.
  expectLargeCard(tags, `/p/${id}/opengraph-image`);
  expect(new URL(tag(tags, "twitter:image")).pathname).toBe(`/p/${id}/twitter-image`);
  const card = await expectCard(anonymous, tag(tags, "og:image"));
  expect(card.equals(await mainCard(anonymous)), "the card is the project's own").toBe(false);
  await expectCard(anonymous, tag(tags, "twitter:image"));
  const response = await anonymous.get(`/p/${id}/opengraph-image`);
  expect(response.headers()["cache-control"]).toBe("private, max-age=300");

  // The company's icon beside the card.
  const icons = await iconLinks(anonymous, `/p/${id}`);
  const iconPath = icons.get("icon") ?? "";
  expect(iconPath).toMatch(new RegExp(`^/api/p/${id}/brand/icon\\?v=[0-9a-f]{16}$`));
  expect(icons.get("apple-touch-icon")).toBe(iconPath);
  const icon = await anonymous.get(iconPath);
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toBe("image/png");
  const png = await icon.body();
  expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({
    width: 192,
    height: 192,
  });
  // Nothing of the project but its name: not the site it reviews.
  for (const [key, value] of tags) expect(value, key).not.toContain("example.com");
  await anonymous.dispose();
});

test("an unknown id, a project in the trash and an archived one unfurl as Squint, naming nothing", async ({
  page,
  playwright,
  baseURL,
}) => {
  const anonymous = await playwright.request.newContext({ baseURL, storageState: SIGNED_OUT });
  await expectSquintPreview(anonymous, randomUUID(), []);

  const trashed = await workspaceProject(page, "Trashed launch");
  await trash(page, trashed);
  await expectSquintPreview(anonymous, trashed, ["Trashed launch", E2E_COMPANY.name]);

  const archived = await workspaceProject(page, "Archived launch");
  const archive = await page.request.put(await projectApi(archived, "/archive"), {
    data: { archived: true },
  });
  expect(archive.ok()).toBe(true);
  await expectSquintPreview(anonymous, archived, ["Archived launch", E2E_COMPANY.name]);
  await anonymous.dispose();
});

test("signed out, the project's page names it and offers Sign in, which opens it", async ({
  page,
  browser,
}) => {
  const id = await workspaceProject(page, PROJECT);
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const guest = await context.newPage();

  const opened = await guest.goto(`/p/${id}`);
  expect(opened?.status()).toBe(200);
  const card = guest.getByTestId("project-sign-in");
  await expect(card).toHaveAttribute("data-branded", "true");
  await expect(guest.getByRole("heading", { level: 1 })).toHaveText(`Sign in to open ${PROJECT}`);
  await expect(guest.getByTestId("project-sign-in-company")).toHaveText(E2E_COMPANY.name);
  // A client sent the team's link by mistake is pointed to the sender.
  await expect(card).toContainText("Not on the team? Ask whoever sent you here for a review link.");
  // Nothing of the project itself: no viewer, no comments, no workspace around it.
  await expect(guest.getByRole("heading", { name: PROJECT, exact: true })).toHaveCount(0);
  await expect(guest.getByRole("button", { name: "Send to ClickUp" })).toHaveCount(0);
  expect(await guest.content()).not.toContain("example.com");

  await mockFrameCheck(guest, {
    verdict: "embeddable",
    finalUrl: "https://example.com/",
    status: 200,
  });
  await guest.route("https://example.com/**", (route) => route.abort());
  await card.getByRole("link", { name: "Sign in" }).click();
  await expect(guest).toHaveURL(new RegExp(`/login\\?next=%2Fp%2F${id}$`));
  await signIn(guest, E2E_COMPANY);
  await expect(guest).toHaveURL(new RegExp(`/p/${id}$`));
  await expect(guest.getByRole("heading", { level: 1, name: PROJECT })).toBeVisible();
  await context.close();
});

test("signed out, a link that doesn't open shows the same Sign in under Squint's name", async ({
  page,
  browser,
}) => {
  const trashed = await workspaceProject(page, "Trashed launch");
  await trash(page, trashed);
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const guest = await context.newPage();

  const screens: string[] = [];
  for (const id of [randomUUID(), trashed]) {
    const opened = await guest.goto(`/p/${id}`);
    expect(opened?.status()).toBe(200);
    const card = guest.getByTestId("project-sign-in");
    await expect(card).not.toHaveAttribute("data-branded");
    await expect(guest.getByRole("heading", { level: 1 })).toHaveText(
      "Sign in to open this project",
    );
    await expect(guest.getByTestId("project-sign-in-company")).toHaveText("Squint");
    screens.push(await card.innerText());
  }
  // Unknown and trashed read the same, word for word.
  expect(screens[0]).toBe(screens[1]);
  expect(screens.join(" ")).not.toContain("Trashed launch");
  expect(screens.join(" ")).not.toContain(E2E_COMPANY.name);
  await context.close();
});

test("signed in, the project's link still opens the viewer, with Squint's own preview", async ({
  page,
}) => {
  const id = await workspaceProject(page, PROJECT);
  await mockFrameCheck(page, {
    verdict: "embeddable",
    finalUrl: "https://example.com/",
    status: 200,
  });
  await page.route("https://example.com/**", (route) => route.abort());
  await page.goto(`/p/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: PROJECT })).toBeVisible();
  await expect(page.getByTestId("project-sign-in")).toHaveCount(0);

  const tags = await unfurl(page.request, `/p/${id}`);
  expect(tag(tags, "og:title")).toBe(MAIN_PREVIEW.title);
  expect(new URL(tag(tags, "og:image")).pathname).toBe("/opengraph-image");
  // The viewer's own posts need their Origin: no referrer policy on its page.
  expect(tags.has("referrer")).toBe(false);
});
