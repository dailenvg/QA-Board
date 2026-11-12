import type { APIRequest, Locator, Page } from "@playwright/test";
import type { CreatedShare } from "../lib/share/types";
import type { Comment, Project, SquintData } from "../lib/store/types";
import type { WorkspaceData } from "../lib/workspace/types";
import { signIn, SIGNED_OUT } from "./auth-fixtures";
import { E2E_COMPANY, SESSION_STATE } from "./e2e-env";
import { snapshotPng } from "./sample-snapshot";
import { skipReviewGuide } from "./squint-fixtures";
import { expect, test } from "./test";
import { addProjectElsewhere, e2eWorkspaceId, shareRow, workspaceRows } from "./workspace-db";

/**
 * What an earlier, local-first build left in a browser, imported on sign-in:
 * the offer, the import and its checks on the server, Not now, Discard, a
 * failed upload retried, and a project another workspace already has.
 */

test.use({ storageState: SIGNED_OUT });

const T = Date.UTC(2026, 9, 20);
const PNG = snapshotPng(320, 200);
const LOCAL_KEY = "squint:v3";

function pages(id: string, origin: "image" | "pdf", count: number): Project["source"] {
  return {
    kind: "pages",
    origin,
    fileName: origin === "pdf" ? "deck.pdf" : "hero.png",
    pages: Array.from({ length: count }, (_, index) => ({
      id: `${id}-${index + 1}`,
      blobKey: `page:${id}-${index + 1}`,
      name: origin === "pdf" ? `Page ${index + 1}` : "hero.png",
      width: 320,
      height: 200,
    })),
  };
}

function comment(id: string, projectId: string, surface: Partial<Comment>): Comment {
  return {
    id,
    projectId,
    x: 25,
    y: 40,
    body: `Note ${id}`,
    author: "Dailen",
    status: "active",
    createdAt: T,
    updatedAt: T,
    ...surface,
  };
}

const crop = (commentId: string) => ({
  blobKey: `crop:${commentId}`,
  rect: { x: 0, y: 0, width: 120, height: 80 },
});

/** Nested folders; an image, a PDF and a website (with a snapshot and `share`); comments with crops. */
function localData(share?: Project["share"], extra: Project[] = []): SquintData {
  const project = (id: string, name: string, folderId: string, source: Project["source"]) => ({
    id,
    name,
    folderId,
    source,
    createdAt: T,
    updatedAt: T,
  });
  return {
    version: 3,
    folders: [
      { id: "lf-client", name: "Client work", createdAt: T, parentId: null },
      { id: "lf-q4", name: "Q4", createdAt: T + 1, parentId: "lf-client" },
    ],
    projects: [
      project("hero", "Hero shot", "lf-client", pages("hero", "image", 1)),
      project("deck", "Pitch deck", "lf-q4", pages("deck", "pdf", 2)),
      {
        ...project("site", "Launch site", "lf-client", {
          kind: "url",
          url: "https://example.com/",
        }),
        ...(share ? { share } : {}),
      },
      ...extra,
    ],
    snapshots: [
      {
        id: "snap-1",
        projectId: "site",
        width: 1280,
        height: 2400,
        createdAt: T,
        blobKey: "snapshot:snap-1",
        sourceUrl: "https://example.com/",
      },
    ],
    comments: [
      comment("c-hero", "hero", { pageId: "hero-1", crop: crop("c-hero") }),
      comment("c-site", "site", { snapshotId: "snap-1", crop: crop("c-site") }),
      comment("c-deck", "deck", { pageId: "deck-2", author: "Client" }),
    ],
    authorName: "Dailen",
  };
}

/** Every image `localData` points at. */
const FILES = [
  "page:hero-1",
  "page:deck-1",
  "page:deck-2",
  "snapshot:snap-1",
  "crop:c-hero",
  "crop:c-site",
];

/** Writes `data` and its images into this browser as the earlier build kept them. */
async function seedLocal(page: Page, data: SquintData, files: readonly string[] = FILES) {
  const bytes = [...PNG];
  await page.evaluate(
    async ({ key, json, files, bytes }) => {
      localStorage.setItem(key, json);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("squint-blobs", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("blobs", { keyPath: "key" });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("open"));
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("blobs", "readwrite");
        const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });
        for (const file of files) transaction.objectStore("blobs").put({ key: file, blob });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("write"));
      });
      db.close();
    },
    { key: LOCAL_KEY, json: JSON.stringify(data), files: [...files], bytes },
  );
}

/** What this browser still holds: its saved data, and how many images. */
async function localState(page: Page): Promise<{ data: string | null; images: number }> {
  return page.evaluate(async (key) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("squint-blobs", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("blobs", { keyPath: "key" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("open"));
    });
    const images = await new Promise<number>((resolve, reject) => {
      const request = db.transaction("blobs").objectStore("blobs").count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("count"));
    });
    db.close();
    return { data: localStorage.getItem(key), images };
  }, LOCAL_KEY);
}

/** Signs in on a browser holding `data`, and waits for the offer. */
async function signInWithLocalData(page: Page, data: SquintData): Promise<Locator> {
  await page.goto("/login");
  await seedLocal(page, data);
  await signIn(page, E2E_COMPANY);
  await expect(
    page.getByRole("dialog", { name: /^Import \d+ projects? into E2E Agency\?$/ }),
  ).toBeVisible();
  // By test id from here on: its name changes with each step.
  return page.getByTestId("import-dialog");
}

/**
 * A review link not attached to any project of a workspace, so it deletes
 * itself after 30 days, as the local-first build's links do. Made with the
 * e2e owner's saved session (creating links needs one now); this page stays
 * signed out.
 */
async function unattachedShare(request: APIRequest, baseURL: string): Promise<CreatedShare> {
  const api = await request.newContext({ baseURL, storageState: SESSION_STATE });
  const response = await api.post("/api/shares", {
    data: {
      project: { name: "Launch site", source: { kind: "url", url: "https://example.com/" } },
      snapshots: [],
      comments: [],
    },
  });
  expect(response.status()).toBe(201);
  const created = (await response.json()) as CreatedShare;
  await api.dispose();
  return created;
}

async function serverWorkspace(page: Page): Promise<WorkspaceData> {
  const response = await page.request.get(`/api/w/${await e2eWorkspaceId()}/snapshot`);
  expect(response.status()).toBe(200);
  return (await response.json()) as WorkspaceData;
}

test("imports projects, comments, images and a review link, then clears this browser", async ({
  page,
  browser,
  playwright,
  baseURL,
}) => {
  const created = await unattachedShare(playwright.request, baseURL ?? "");
  expect((await shareRow(created.shareId))?.expiresAt).not.toBeNull();
  const share = {
    id: created.shareId,
    token: created.token,
    ownerKey: created.ownerKey,
    createdAt: T,
    cursor: 0,
    reviewWindowHours: 72,
    reviewEndsAt: T + 72 * 60 * 60 * 1000,
  };
  const dialog = await signInWithLocalData(page, localData(share));
  await expect(dialog).toHaveAccessibleName("Import 3 projects into E2E Agency?");
  await expect(dialog).toContainText("This browser has 3 projects, 2 folders and 3 comments.");
  await expect(dialog.getByTestId("import-start")).toBeFocused();

  await dialog.getByTestId("import-start").click();
  await expect(dialog.getByTestId("import-done")).toBeVisible();
  await expect(dialog).toHaveAccessibleName("Imported into E2E Agency");
  await expect(dialog).toContainText("3 projects, 3 comments and 6 images are now in E2E Agency.");
  await expect(dialog.getByTestId("import-kept")).toHaveText(
    "This browser's copy has been removed.",
  );
  await expect(dialog.getByTestId("import-skipped")).toHaveCount(0);
  await dialog.getByTestId("import-finish").click();
  await expect(dialog).toBeHidden();
  // Squiggy cheers once the summary is out of the way, not behind it.
  await expect(page.getByTestId("squiggy-speech")).toHaveText("All moved in.");
  expect(await localState(page)).toEqual({ data: null, images: 0 });

  // On the server after a reload: everything, once, and no offer.
  await page.goto("/f/lf-q4");
  await expect(page.getByRole("heading", { level: 1, name: "Q4" })).toBeVisible();
  await expect(page.getByText("Pitch deck").first()).toBeVisible();
  await expect(page.getByTestId("import-dialog")).toHaveCount(0);
  const server = await serverWorkspace(page);
  expect(server.projects.map((project) => project.id).sort()).toEqual(["deck", "hero", "site"]);
  expect(server.folders.map((folder) => [folder.id, folder.parentId])).toEqual(
    expect.arrayContaining([
      ["lf-client", null],
      ["lf-q4", "lf-client"],
    ]),
  );
  expect(server.comments).toHaveLength(3);
  expect(server.snapshots).toHaveLength(1);
  expect(await workspaceRows("workspace_blobs")).toBe(FILES.length);
  const owners: Record<string, string> = {
    "page:hero-1": "hero",
    "page:deck-1": "deck",
    "page:deck-2": "deck",
    "snapshot:snap-1": "site",
    "crop:c-hero": "hero",
    "crop:c-site": "site",
  };
  for (const key of FILES) {
    const file = await page.request.get(
      `/api/w/${await e2eWorkspaceId()}/projects/${owners[key]}/blobs/${encodeURIComponent(key)}`,
    );
    expect(file.status(), key).toBe(200);
    expect(file.headers()["content-type"]).toBe("image/png");
  }

  // The imported picture shows in the viewer.
  await page.goto("/p/hero");
  const image = page.getByRole("img", { name: /the image under review/ });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
    .toBe(320);

  // The review link joined the workspace, stopped deleting itself, and still opens for a guest.
  expect(await shareRow(created.shareId)).toEqual({
    workspaceId: await e2eWorkspaceId(),
    expiresAt: null,
  });
  const guestContext = await browser.newContext({ storageState: SIGNED_OUT });
  const guest = await guestContext.newPage();
  await skipReviewGuide(guest);
  const opened = await guest.goto(`/s/${created.token}`);
  expect(opened?.status()).toBe(200);
  await expect(guest.getByRole("heading", { level: 1, name: "Launch site" })).toBeVisible();
  await guestContext.close();
});

test("Not now keeps the data and asks again on the next sign-in", async ({ page }) => {
  const dialog = await signInWithLocalData(page, localData());
  // Escape is Not now.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.getByTestId("account-menu").or(page.getByRole("main")).first()).toBeVisible();
  await expect(page.getByTestId("import-dialog")).toHaveCount(0);
  expect((await localState(page)).images).toBe(FILES.length);

  // Signed out, then in again: asked again, and nothing reached the server meanwhile.
  await page.context().clearCookies();
  await page.goto("/login");
  await signIn(page, E2E_COMPANY);
  await expect(
    page.getByRole("dialog", { name: "Import 3 projects into E2E Agency?" }),
  ).toBeVisible();
  await page.getByTestId("import-later").click();
  expect(await workspaceRows("projects")).toBe(0);
  expect((await localState(page)).data).not.toBeNull();
});

test("Discard asks first, then clears this browser and imports nothing", async ({ page }) => {
  const dialog = await signInWithLocalData(page, localData());
  await dialog.getByTestId("import-discard").click();
  await expect(dialog).toHaveAccessibleName("Discard local data?");
  await expect(dialog).toContainText("This deletes 3 projects and their comments and images");
  // Cancel is focused first and goes back to the offer.
  await expect(dialog.getByTestId("import-discard-cancel")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveAccessibleName("Import 3 projects into E2E Agency?");
  expect((await localState(page)).images).toBe(FILES.length);

  await dialog.getByTestId("import-discard").click();
  await dialog.getByTestId("import-discard-confirm-button").click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Local data discarded from this browser.")).toBeVisible();
  expect(await localState(page)).toEqual({ data: null, images: 0 });
  expect(await workspaceRows("projects")).toBe(0);
  await page.reload();
  await expect(page.getByTestId("import-dialog")).toHaveCount(0);
});

test("an upload that fails part way keeps the data, and Retry finishes without duplicates", async ({
  page,
}) => {
  const dialog = await signInWithLocalData(page, localData());
  let failed = false;
  await page.route("**/api/w/*/projects/*/blobs/*", async (route) => {
    if (route.request().method() === "PUT" && !failed) {
      failed = true;
      await route.abort("connectionreset");
      return;
    }
    await route.fallback();
  });
  await dialog.getByTestId("import-start").click();
  await expect(dialog.getByTestId("import-failed")).toBeVisible();
  await expect(dialog).toHaveAccessibleName("The import didn't finish");
  await expect(dialog).toContainText("Check your connection, then try again.");
  await expect(dialog.getByTestId("import-retry")).toBeFocused();
  expect((await localState(page)).data).not.toBeNull();
  expect(await workspaceRows("workspace_blobs")).toBeLessThan(FILES.length);

  await dialog.getByTestId("import-retry").click();
  await expect(dialog.getByTestId("import-done")).toBeVisible();
  await expect(dialog).toContainText("3 projects, 3 comments and 6 images are now in E2E Agency.");
  expect(await workspaceRows("projects")).toBe(3);
  expect(await workspaceRows("comments")).toBe(3);
  expect(await workspaceRows("snapshots")).toBe(1);
  expect(await workspaceRows("workspace_blobs")).toBe(FILES.length);
  expect(await localState(page)).toEqual({ data: null, images: 0 });
});

test("a project another workspace has is skipped and named; the rest come in", async ({ page }) => {
  await addProjectElsewhere("taken");
  const taken: Project = {
    id: "taken",
    name: "Their homepage",
    folderId: "lf-client",
    source: { kind: "url", url: "https://example.org/" },
    createdAt: T,
    updatedAt: T,
  };
  const dialog = await signInWithLocalData(page, localData(undefined, [taken]));
  await expect(dialog).toHaveAccessibleName("Import 4 projects into E2E Agency?");
  await dialog.getByTestId("import-start").click();
  await expect(dialog.getByTestId("import-done")).toBeVisible();
  await expect(dialog).toHaveAccessibleName("Some items weren't imported");
  await expect(dialog.getByTestId("import-skipped")).toHaveText(
    "Their homepage already belongs to another workspace, so it wasn't imported.",
  );
  await expect(dialog.getByTestId("import-kept")).toContainText("This browser still has its copy");
  expect((await serverWorkspace(page)).projects.map((project) => project.id).sort()).toEqual([
    "deck",
    "hero",
    "site",
  ]);
  // Kept: the browser still has the project that couldn't come in.
  await dialog.getByTestId("import-finish").click();
  await expect(page.getByTestId("squiggy-speech")).toHaveText(
    "Most of it moved in. A few items need another look.",
  );
  expect((await localState(page)).data).not.toBeNull();
});

test("saved data that can't be read is never cleared on its own", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate((key) => localStorage.setItem(key, "{ not json"), LOCAL_KEY);
  await signIn(page, E2E_COMPANY);
  const dialog = page.getByTestId("import-dialog");
  await expect(dialog.getByTestId("import-unreadable")).toBeVisible();
  await expect(dialog).toHaveAccessibleName("We couldn't read the projects saved in this browser");
  await expect(dialog).toContainText("Nothing has been removed.");
  const download = page.waitForEvent("download");
  await dialog.getByTestId("import-download").click();
  expect((await download).suggestedFilename()).toBe("squint-local-data.json");
  await dialog.getByTestId("import-later").click();
  await expect(dialog).toBeHidden();
  expect((await localState(page)).data).toBe("{ not json");
});
