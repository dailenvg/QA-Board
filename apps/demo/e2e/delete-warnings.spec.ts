import type { Page } from "@playwright/test";
import { expect, test } from "./test";
import type { WorkspaceData } from "../lib/workspace/types";
import { DEFAULT_FOLDER, seedWorkspace, shareWorkspaceProject } from "./squint-fixtures";
import { e2eWorkspaceId } from "./workspace-db";
import { WORKSPACE_SEED } from "./workspace-seed";

test.beforeEach(async ({ page }) => {
  // The website cards ask for the site's favicon; keep the specs off the network.
  await page.route("https://example.com/**", (route) => route.abort());
});

/**
 * When the project's review window ends, as the browser shows it: "Sun, Nov 15 · 4:30 PM", in
 * the browser's own time zone (`openUntil`).
 */
async function openUntil(page: Page, projectId: string): Promise<string> {
  const response = await page.request.get(`/api/w/${await e2eWorkspaceId()}/snapshot`);
  const data = (await response.json()) as WorkspaceData;
  const endsAt = data.projects.find((project) => project.id === projectId)?.share?.reviewEndsAt;
  if (typeof endsAt !== "number") throw new Error(`${projectId} has no review window end.`);
  return page.evaluate((end) => {
    const day = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
    return `${day.format(end)} · ${time.format(end)}`;
  }, endsAt);
}

/** The seed, plus a shared project (a 3-day review window) in My projects. */
async function seedShared(page: Page): Promise<string> {
  await seedWorkspace(page, WORKSPACE_SEED, "/sandbox");
  const { projectId } = await shareWorkspaceProject(page, "Shared site");
  await page.goto(`/f/${DEFAULT_FOLDER.id}`);
  return projectId;
}

async function openProjectDelete(page: Page, name: string) {
  const card = page.getByTestId("project-card").filter({ hasText: name });
  await card.getByTestId("project-menu").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: `Delete ${name}?` });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("deleting a shared project warns that its clients lose access, naming when its link ends", async ({
  page,
}) => {
  const projectId = await seedShared(page);
  const until = await openUntil(page, projectId);

  const shared = await openProjectDelete(page, "Shared site");
  await expect(shared).toContainText(
    "The project and all its comments will be deleted, and its share link will stop working. You'll have a few seconds to undo it.",
  );
  await expect(shared.getByTestId("share-link-warning")).toHaveText(
    `Clients will lose access. The link is open until ${until}.`,
  );
  // Read with the dialog's description.
  await expect(shared).toHaveAccessibleDescription(/Clients will lose access/);
  await shared.getByRole("button", { name: "Cancel" }).click();
  await expect(shared).toHaveCount(0);

  const unshared = await openProjectDelete(page, "Homepage");
  await expect(unshared).toContainText(
    "The project and all its comments will be deleted. You'll have a few seconds to undo it.",
  );
  await expect(unshared.getByTestId("share-link-warning")).toHaveCount(0);
});

test("deleting a folder holding a shared project warns too; one without doesn't", async ({
  page,
}) => {
  const projectId = await seedShared(page);
  const until = await openUntil(page, projectId);

  await page.getByTestId("folder-menu").click();
  await page.getByRole("menuitem", { name: "Delete folder" }).click();
  const shared = page.getByRole("dialog", { name: `Delete ${DEFAULT_FOLDER.name}?` });
  await expect(shared.getByTestId("folder-delete-counts")).toContainText(
    "1 share link stops working",
  );
  await expect(shared.getByTestId("share-link-warning")).toHaveText(
    `Clients will lose access to the shared project. The link is open until ${until}.`,
  );
  await shared.getByRole("button", { name: "Cancel" }).click();
  await expect(shared).toHaveCount(0);

  await page.goto("/f/cafe");
  await page.getByTestId("folder-menu").click();
  await page.getByRole("menuitem", { name: "Delete folder" }).click();
  const unshared = page.getByRole("dialog", { name: "Delete Café menus?" });
  await expect(unshared.getByTestId("folder-delete-counts")).toBeVisible();
  await expect(unshared.getByTestId("share-link-warning")).toHaveCount(0);
});
