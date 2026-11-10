import type { Page } from "@playwright/test";
import { expect, test } from "./test";
import { SIGNED_OUT } from "./auth-fixtures";
import { shareWorkspaceProject } from "./squint-fixtures";
import {
  e2eWorkspaceId,
  setStorageQuota,
  storeFilesFor,
  storeProjects,
  type StoredProject,
} from "./workspace-db";

const MB = 1024 * 1024;
/** Noon UTC, so the date reads the same in any US time zone. */
const ARCHIVED = "2026-12-01T12:00:00Z";
const DELETES_ON = "Deletes on Dec 31, 2026";

/** 990 MB in all: a PDF (archived), a website, images, and a website in the trash. */
const PROJECTS: StoredProject[] = [
  {
    id: "deck",
    name: "Pitch deck",
    origin: "pdf",
    archivedAt: ARCHIVED,
    files: [
      { kind: "page", size: 300 * MB },
      { kind: "page", size: 300 * MB },
    ],
  },
  {
    id: "site",
    name: "Spring site",
    files: [
      { kind: "snapshot", size: 200 * MB },
      { kind: "crop", size: 50 * MB },
    ],
  },
  { id: "shots", name: "Mockups", origin: "image", files: [{ kind: "page", size: 100 * MB }] },
  {
    id: "old",
    name: "Old landing",
    trashedAt: ARCHIVED,
    files: [{ kind: "snapshot", size: 40 * MB }],
  },
];

async function openStorage(page: Page) {
  await page.goto("/account/storage");
  await expect(page.getByTestId("storage-settings")).toBeVisible();
}

test("shows used of quota and a per-type breakdown", async ({ page }) => {
  await storeProjects(PROJECTS);
  await page.goto("/account");
  const nav = page.getByRole("navigation", { name: "Account settings" });
  await nav.getByRole("link", { name: "Storage" }).click();
  await expect(page).toHaveURL(/\/account\/storage$/);
  await expect(nav.getByRole("link", { name: "Storage" })).toHaveAttribute("aria-current", "page");

  const meter = page.getByTestId("storage-meter");
  await expect(meter).toHaveAttribute("data-level", "ok");
  await expect(meter).toContainText("990 MB of 5 GB used");
  await expect(meter).toContainText("19% · 6 files");
  await expect(page.getByTestId("storage-alert")).toHaveCount(0);

  const buckets = page.getByTestId("storage-bucket");
  await expect(buckets).toHaveCount(4);
  await expect(buckets.nth(0)).toContainText("Images");
  await expect(buckets.nth(0)).toContainText("100 MB");
  await expect(buckets.nth(1)).toContainText("PDFs");
  await expect(buckets.nth(1)).toContainText("600 MB");
  await expect(buckets.nth(1)).toContainText("2 files");
  await expect(buckets.nth(2)).toContainText("Snapshots");
  await expect(buckets.nth(2)).toContainText("240 MB");
  await expect(buckets.nth(3)).toContainText("Crops");
  await expect(buckets.nth(3)).toContainText("50 MB");
});

test("lists large projects by size, with archived and trashed ones marked", async ({ page }) => {
  await storeProjects(PROJECTS);
  await openStorage(page);
  const rows = page.getByTestId("large-project");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText("Pitch deck");
  await expect(rows.nth(0)).toContainText("600 MB · 2 files");
  await expect(rows.nth(0).getByTestId("large-project-chip")).toHaveText("Archived");
  await expect(rows.nth(0).getByTestId("large-project-deletes")).toHaveText(DELETES_ON);
  await expect(rows.nth(1)).toContainText("Spring site");
  await expect(rows.nth(1).getByTestId("large-project-chip")).toHaveCount(0);
  await expect(rows.nth(2)).toContainText("Mockups");
  await expect(rows.nth(3)).toContainText("Old landing");
  await expect(rows.nth(3).getByTestId("large-project-chip")).toHaveText("In trash");
  await expect(rows.nth(3).getByTestId("large-project-deletes")).toHaveText(DELETES_ON);
  // A project in the trash can't be opened; the others link to theirs.
  await expect(rows.nth(3)).not.toHaveAttribute("href");
  await rows.nth(1).click();
  await expect(page).toHaveURL(/\/p\/site$/);
});

test("Squiggy thinks near the quota, and says uploads stop past it", async ({ page }) => {
  await storeProjects(PROJECTS);
  await setStorageQuota(1100 * MB);
  await openStorage(page);
  const alert = page.getByTestId("storage-alert");
  await expect(alert).toHaveAttribute("data-level", "near");
  await expect(alert).toContainText("Running low on space");
  await expect(alert.locator(".squint-mascot")).toHaveAttribute("data-mood", "thinking");

  await setStorageQuota(900 * MB);
  await page.reload();
  await expect(page.getByTestId("storage-meter")).toHaveAttribute("data-level", "over");
  await expect(alert).toHaveAttribute("data-level", "over");
  await expect(alert).toContainText("Out of space");
  await expect(page.getByTestId("storage-meter")).toContainText("110%");
});

test("an empty workspace says nothing is stored yet", async ({ page }) => {
  await openStorage(page);
  await expect(page.getByTestId("storage-meter")).toContainText("0 B of 5 GB used");
  await expect(page.getByTestId("storage-breakdown-empty")).toBeVisible();
  await expect(page.getByTestId("large-projects-empty")).toContainText(
    "No projects are using space yet",
  );
});

test("an archived project shows its delete date and its review link still opens", async ({
  page,
  playwright,
  baseURL,
}) => {
  const { token, projectId } = await shareWorkspaceProject(page, "Archived launch");
  await storeFilesFor(projectId, [{ kind: "snapshot", size: 10 * MB }]);
  const archive = `/api/w/${await e2eWorkspaceId()}/projects/${projectId}/archive`;
  const archived = await page.request.put(archive, { data: { archived: true } });
  expect(archived.status()).toBe(200);
  expect((await archived.json()) as { deleteAfter: number | null }).toMatchObject({
    deleteAfter: expect.any(Number),
  });

  const guest = await playwright.request.newContext({ baseURL, storageState: SIGNED_OUT });
  expect((await guest.get(`/api/s/${token}`)).status()).toBe(200);
  await guest.dispose();

  await openStorage(page);
  const row = page.getByTestId("large-project").filter({ hasText: "Archived launch" });
  await expect(row.getByTestId("large-project-chip")).toHaveText("Archived");
  await expect(row.getByTestId("large-project-deletes")).toContainText("Deletes on");

  const restored = await page.request.put(archive, { data: { archived: false } });
  expect((await restored.json()) as { deleteAfter: number | null }).toMatchObject({
    deleteAfter: null,
  });
  await page.reload();
  await expect(row.getByTestId("large-project-chip")).toHaveCount(0);
  await expect(row.getByTestId("large-project-deletes")).toHaveCount(0);
});
