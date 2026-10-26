import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { seedWorkspace, settled } from "./squint-fixtures";
import { WORKSPACE_SEED } from "./workspace-seed";

function searchInput(page: Page): Locator {
  return page.getByRole("combobox", { name: "Search projects and folders" });
}

/** The field even while hidden (a phone's closed search), where role queries can't see it. */
function searchField(page: Page): Locator {
  return page.getByTestId("search-input");
}

/** Opens the search the way each screen offers it: the field, or the phone's icon button. */
async function openSearch(page: Page, isMobile: boolean): Promise<Locator> {
  const input = searchInput(page);
  if (isMobile) await page.getByRole("button", { name: "Search projects and folders" }).click();
  else await input.click();
  await expect(input).toBeFocused();
  return input;
}

test.beforeEach(async ({ page }) => {
  await page.route("https://example.com/**", (route) => route.abort());
  await seedWorkspace(page, WORKSPACE_SEED);
  await expect(page.getByTestId("overview-hero")).toBeVisible();
});

test("finds a nested project by part of its name, in any case, and Enter opens it", async ({
  page,
  isMobile,
}) => {
  const input = await openSearch(page, isMobile);
  await input.fill("cAMPAIGN ban");

  // Its name is what it shows (name, then where it sits), then its type.
  const option = page.getByRole("option", {
    name: /^Spring Campaign Banner\s*Client work › Q4 › Launch\s*,\s*Image$/,
  });
  await expect(option).toBeVisible();
  await expect(option).toContainText("Client work › Q4 › Launch");
  await expect(option.locator("mark")).toHaveText("Campaign Ban");
  await expect(option).toHaveAttribute("aria-selected", "true");
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await expect(input).toHaveAttribute(
    "aria-activedescendant",
    (await option.getAttribute("id")) ?? "",
  );
  await expect(page.getByTestId("search-status")).toHaveText("1 result found");

  await settled(page.getByTestId("search-popup"));
  const axe = await new AxeBuilder({ page }).include('[role="search"]').analyze();
  expect(axe.violations.map(({ id, nodes }) => ({ id, nodes: nodes.length }))).toEqual([]);

  await input.press("Enter");
  await expect(page).toHaveURL(/\/p\/nested$/);
});

test("arrow keys move through folders, then projects; Enter opens a folder", async ({
  page,
  isMobile,
}) => {
  const input = await openSearch(page, isMobile);
  await input.fill("u");
  const popup = page.getByTestId("search-popup");
  await expect(popup.getByRole("group", { name: "Folders" })).toBeVisible();
  await expect(popup.getByRole("group", { name: "Projects" })).toBeVisible();
  const options = popup.getByRole("option");
  const selected = popup.getByRole("option", { selected: true });

  // Folders, then projects, each A to Z ("u" starts none of these names).
  await expect(options).toHaveText([/^Café menus/, /^Launch/, /^Mockups/, /^Résumé review/]);
  await expect(selected).toHaveText(/^Café menus/);
  await input.press("ArrowDown");
  await expect(selected).toHaveText(/^Launch/);
  await input.press("ArrowUp");
  await expect(selected).toHaveText(/^Café menus/);
  // Both ends wrap around.
  await input.press("ArrowUp");
  await expect(selected).toHaveText(/^Résumé review/);
  await input.press("ArrowDown");
  await input.press("ArrowDown");
  await expect(selected).toHaveText(/^Launch/);
  await expect(selected).toHaveAccessibleName(/^Launch\s*Client work › Q4\s*,\s*Folder$/);

  await input.press("Enter");
  await expect(page).toHaveURL(/\/f\/launch$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Launch");
  // The search stays on the folder page, cleared.
  if (!isMobile) await expect(searchInput(page)).toHaveValue("");
});

test("no match shows an empty state; Escape clears, then leaves", async ({ page, isMobile }) => {
  const input = await openSearch(page, isMobile);
  await input.fill("zzz");
  await expect(page.getByTestId("search-empty")).toContainText("Nothing is named “zzz”");
  await expect(page.getByTestId("search-status")).toHaveText("No results");
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("listbox")).toHaveCount(0);

  await input.press("Escape");
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await input.press("Escape");
  await expect(searchField(page)).not.toBeFocused();
  await expect(page.getByTestId("search-popup")).toHaveCount(0);
});

test("/ and Ctrl+K focus the search, but not while typing elsewhere or in a dialog", async ({
  page,
}) => {
  const input = searchInput(page);
  await page.keyboard.press("/");
  await expect(input).toBeFocused();
  // Typed into the field, "/" is just a character.
  await page.keyboard.press("/");
  await expect(input).toHaveValue("/");
  await input.press("Escape");
  await input.press("Escape");
  await expect(searchField(page)).not.toBeFocused();

  await page.keyboard.press("Control+k");
  await expect(input).toBeFocused();
  await input.press("Escape");

  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog", { name: "New project" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("/");
  await expect(searchField(page)).not.toBeFocused();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
});

test("on a phone, search is an icon button that opens the field full width", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Phones only.");
  const toggle = page.getByRole("button", { name: "Search projects and folders" });
  const input = searchInput(page);
  await expect(toggle).toBeVisible();
  await expect(input).toBeHidden();
  const box = await toggle.boundingBox();
  expect(box && box.width >= 44 && box.height >= 44).toBe(true);

  await toggle.click();
  await expect(input).toBeFocused();
  const field = await input.boundingBox();
  const main = await page.locator("main").boundingBox();
  expect(field && main && Math.round(field.width) === Math.round(main.width)).toBe(true);

  await input.press("Escape");
  await expect(input).toBeHidden();
  await expect(toggle).toBeFocused();
});
