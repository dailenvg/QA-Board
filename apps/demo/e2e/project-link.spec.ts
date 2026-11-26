import { randomUUID } from "node:crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./test";
import { MAIN_PREVIEW, TEAM_REVIEW_CARD_ALT, teamReviewPreview } from "../lib/link-preview";
import { signIn, SIGNED_OUT } from "./auth-fixtures";
import { E2E_COMPANY } from "./e2e-env";
import { snapshotPng } from "./sample-snapshot";
import {
  addDefaultFolder,
  DEFAULT_FOLDER,
  mockFrameCheck,
  seedFile,
  seedWorkspace,
} from "./squint-fixtures";
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

test("signed out, a comment's link survives Sign in and opens on its page, tab and popover", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One desktop browser is enough for this.");
  const projectId = `linked-${Date.now().toString(36)}`;
  const at = 1_700_000_000_000;
  const note = { projectId, author: "Ana", createdAt: at, updatedAt: at } as const;
  await seedWorkspace(page, {
    version: 3,
    folders: [{ id: "linked", name: "Linked", parentId: null, createdAt: at }],
    projects: [
      {
        id: projectId,
        folderId: "linked",
        name: "Two pages",
        source: {
          kind: "pages",
          origin: "image",
          fileName: "home.png",
          pages: [
            { id: "page-1", blobKey: "page:home", name: "home.png" },
            { id: "page-2", blobKey: "page:about", name: "about.png" },
          ],
        },
        createdAt: at,
        updatedAt: at,
      },
    ],
    comments: [
      {
        ...note,
        id: "on-one",
        x: 20,
        y: 30,
        body: "First page note",
        status: "active",
        pageId: "page-1",
      },
      // Enough resolved ones before it that its card starts below the list's fold.
      ...Array.from({ length: 12 }, (_, index) => ({
        ...note,
        id: `done-${index}`,
        x: 10 + index * 5,
        y: 20,
        body: `Done note ${index}`,
        status: "resolved" as const,
        resolvedAt: at,
        pageId: "page-1",
      })),
      {
        ...note,
        id: "on-two",
        createdAt: at + 1_000,
        x: 40,
        y: 50,
        body: "About page, done",
        status: "resolved",
        resolvedAt: at,
        pageId: "page-2",
      },
    ],
    snapshots: [],
    replies: [],
    authorName: "Ana",
  });
  await seedFile(page, projectId, "page:home", snapshotPng(1200, 900));
  await seedFile(page, projectId, "page:about", snapshotPng(1200, 900));

  const context = await browser.newContext({ storageState: SIGNED_OUT });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  const member = await context.newPage();
  await member.goto(`/p/${projectId}?comment=on-two`);
  await member.getByTestId("project-sign-in").getByRole("link", { name: "Sign in" }).click();
  await expect(member).toHaveURL(
    new RegExp(`/login\\?next=%2Fp%2F${projectId}%3Fcomment%3Don-two$`),
  );
  await signIn(member, E2E_COMPANY);

  // Page 2, the Resolved tab (it's resolved), the card selected and its pin's popover open.
  await expect(member.getByTestId("page-position")).toHaveText("Page 2 of 2");
  const popover = member.getByTestId("pin-popover");
  await expect(popover).toContainText("About page, done");
  const card = member.locator('[data-testid="comment-card"][data-comment-id="on-two"]');
  await expect(card.locator("[data-card-select]")).toHaveAttribute("aria-pressed", "true");
  // The list brought the card into view too, from below twelve other resolved ones.
  await expect(card).toBeInViewport();
  const list = member.getByRole("list", { name: "Resolved comments" });
  expect(await list.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  // Read once, then gone from the address; the page it opened stays.
  await expect(member).toHaveURL(new RegExp(`/p/${projectId}\\?page=2$`));

  // The popover's More leaves Copy link to the header's button, which copies the project's link
  // to the comment, absolute.
  await popover.getByRole("button", { name: "Actions for comment 14" }).click();
  await expect(member.getByRole("menuitem", { name: "Get info" })).toBeVisible();
  await expect(member.getByRole("menuitem", { name: "Copy link" })).toHaveCount(0);
  await member.keyboard.press("Escape");
  await popover.getByRole("button", { name: "Copy link to comment 14" }).click();
  await expect(member.getByTestId("toast").filter({ hasText: "Link copied." })).toBeVisible();
  expect(await member.evaluate(() => navigator.clipboard.readText())).toBe(
    `${baseURL}/p/${projectId}?comment=on-two`,
  );

  // A link to a comment that's gone says so, and drops the parameter.
  await member.goto(`/p/${projectId}?comment=deleted-one`);
  await expect(
    member
      .getByTestId("toast")
      .filter({ hasText: "That comment is no longer here. It may have been deleted." }),
  ).toBeVisible();
  await expect(member).toHaveURL(new RegExp(`/p/${projectId}$`));
  await expect(popover).toHaveCount(0);
  await context.close();
});
