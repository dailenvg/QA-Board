import { expect, test, type Page } from "@playwright/test";
import type { SquintData } from "../lib/store/types";
import { folderCard, seedWorkspace } from "./squint-fixtures";

/** Before fresh workspaces started empty: the folder every new browser got, untouched. */
const LEFTOVER: SquintData = {
  version: 3,
  folders: [
    { id: "default", name: "My projects", createdAt: Date.UTC(2026, 9, 25, 12), parentId: null },
  ],
  projects: [],
  comments: [],
  snapshots: [],
  revocations: [],
  authorName: null,
};

async function storedFolderNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("squint:v3") ?? "{}") as SquintData;
    return data.folders.map((folder) => folder.name);
  });
}

test("an untouched folder left from the old seed is removed, so the welcome shows", async ({
  page,
}) => {
  await seedWorkspace(page, LEFTOVER);
  await expect(page.getByTestId("overview-empty")).toBeVisible();
  await expect(page.getByTestId("folder-tree-empty")).toHaveText(
    "No folders yet. Use New folder above.",
  );
  await expect(page.getByRole("treeitem")).toHaveCount(0);
  expect(await storedFolderNames(page)).toEqual([]);
});

test("the old seeded folder stays once it holds a project", async ({ page }) => {
  await seedWorkspace(page, {
    ...LEFTOVER,
    projects: [
      {
        id: "p1",
        folderId: "default",
        name: "Homepage",
        source: { kind: "url", url: "https://example.com/" },
        createdAt: Date.UTC(2026, 9, 25, 13),
        updatedAt: Date.UTC(2026, 9, 25, 13),
      },
    ],
  });
  await expect(folderCard(page, "My projects")).toBeVisible();
  await expect(page.getByRole("treeitem", { name: /^My projects/ })).toHaveCount(1);
  await expect(page.getByTestId("overview-empty")).toHaveCount(0);
  expect(await storedFolderNames(page)).toEqual(["My projects"]);
});
