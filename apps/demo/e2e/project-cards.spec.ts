import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  DEFAULT_FOLDER,
  openFolder,
  pickImages,
  samplePngFiles,
  seedWorkspace,
  settled,
} from "./squint-fixtures";
import { WORKSPACE_SEED } from "./workspace-seed";

test.beforeEach(async ({ page }) => {
  // The website card asks for the site's favicon; keep the specs off the network.
  await page.route("https://example.com/**", (route) => route.abort());
});

test("combined images show how many there are on their card", async ({ page }) => {
  await openFolder(page);
  const dialog = await pickImages(page, await samplePngFiles(page, ["One", "Two", "Three"]));
  await dialog.getByTestId("grouping-combine").click();
  await dialog.getByTestId("create-project").click();
  await expect(page.getByTestId("page-position")).toHaveText("Page 1 of 3");

  await page.getByRole("link", { name: `Back to ${DEFAULT_FOLDER.name}` }).click();
  const card = page.getByTestId("project-card");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("3 images");
  await expect(card).not.toContainText("one.png");
});

test("each card names its type, keeps single files' names, and passes axe", async ({ page }) => {
  await seedWorkspace(page, WORKSPACE_SEED, `/f/${DEFAULT_FOLDER.id}`);
  const cards = page.getByTestId("project-card");
  await expect(cards).toHaveCount(4);

  const expected = [
    { name: "Homepage", type: "Website", line: "example.com" },
    { name: "Hero shot", type: "Image", line: "hero.png" },
    { name: "Mockups", type: "Image", line: "3 images" },
    { name: "Pitch deck", type: "PDF", line: "pitch.pdf" },
  ];
  for (const { name, type, line } of expected) {
    const card = cards.filter({ hasText: name });
    // The type is part of the card link's name, after the project's own.
    const link = card.getByRole("link", { name: new RegExp(`^${name}\\s*,\\s*${type}$`) });
    await expect(link).toHaveCount(1);
    await expect(card.getByTestId("project-type-tag")).toHaveAttribute("title", type);
    await expect(card).toContainText(line);
  }

  // The tag is part of the link: a click on it opens the project.
  const tag = cards.filter({ hasText: "Pitch deck" }).getByTestId("project-type-tag");
  await settled(cards);
  const axe = await new AxeBuilder({ page }).include('[data-testid="project-card"]').analyze();
  expect(axe.violations.map(({ id, nodes }) => ({ id, nodes: nodes.length }))).toEqual([]);

  await tag.click();
  await expect(page).toHaveURL(/\/p\/deck$/);
});

test("hover draws a brand line around a card; keyboard focus outranks it", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Touch has no hover.");
  await seedWorkspace(page, WORKSPACE_SEED, `/f/${DEFAULT_FOLDER.id}`);
  const card = page.getByTestId("project-card").filter({ hasText: "Homepage" });
  await settled(card);
  const shadow = () => card.evaluate((element) => getComputedStyle(element).boxShadow);
  // Brand and focus share a color in light mode; the 2px gap tells focus apart.
  const line = "rgb(12, 84, 204) 0px 0px 0px 2px";
  const focusRing = "rgb(12, 84, 204) 0px 0px 0px 4px";

  await expect.poll(shadow).not.toContain(line);
  await card.hover();
  await expect.poll(shadow).toContain(line);

  // Still hovered: a key press first, so the focus that follows is keyboard focus.
  await page.keyboard.press("Tab");
  await card.getByRole("link").focus();
  await expect.poll(shadow).toContain(focusRing);
  await expect.poll(shadow).toContain("rgb(231, 231, 234) 0px 0px 0px 2px");
});
