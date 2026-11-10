import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./test";
import type { Folder, Project, SquintData } from "../lib/store/types";
import { seedWorkspace } from "./squint-fixtures";

/** Thirty top-level folders with a project each: more than the navigation block can show. */
function manyFolders(): SquintData {
  const now = Date.now();
  const folders: Folder[] = Array.from({ length: 30 }, (_, index) => ({
    id: `f${index}`,
    name: `Folder ${String(index + 1).padStart(2, "0")}`,
    createdAt: now - 1000 + index,
    parentId: null,
  }));
  const projects: Project[] = folders.map((folder, index) => ({
    id: `p${index}`,
    folderId: folder.id,
    name: `Project ${index + 1}`,
    source: { kind: "url", url: "https://example.com/" },
    createdAt: now + index,
    updatedAt: now + index,
  }));
  return { version: 3, folders, projects, comments: [], snapshots: [], authorName: null };
}

function block(page: Page, name: "brand" | "nav" | "account"): Locator {
  return page.getByTestId(`sidebar-${name}`);
}

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (!found) throw new Error("No box.");
  return found;
}

test.describe("on a wide screen", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the side panel is three blocks that fill the screen; the navigation scrolls inside", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Phones stack the blocks at their natural height.");
    await seedWorkspace(page, manyFolders(), "/folders");
    const panel = page.getByRole("complementary", { name: "Workspace" });
    // Inside the page's 16px gutters, top to bottom, and no taller.
    const outer = await box(panel);
    expect(outer.y).toBeCloseTo(16, 0);
    expect(outer.y + outer.height).toBeCloseTo(800 - 16, 0);
    const [brand, nav, account] = await Promise.all([
      box(block(page, "brand")),
      box(block(page, "nav")),
      box(block(page, "account")),
    ]);
    // Stacked with a gap between them: separate blocks.
    expect(nav.y).toBeGreaterThan(brand.y + brand.height);
    expect(account.y).toBeGreaterThan(nav.y + nav.height);
    expect(account.y + account.height).toBeCloseTo(outer.y + outer.height, 0);

    // Thirty folders overflow the navigation, which scrolls on its own brand scrollbar.
    const scroller = block(page, "nav");
    await expect
      .poll(() => scroller.evaluate((element) => element.scrollHeight > element.clientHeight))
      .toBe(true);
    expect(await scroller.evaluate((element) => getComputedStyle(element).scrollbarWidth)).toBe(
      "thin",
    );
    await scroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    // The brand and the profile stay put; the page itself doesn't scroll.
    expect(await box(block(page, "brand"))).toEqual(brand);
    expect(await box(block(page, "account"))).toEqual(account);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // The profile's menu opens above it and works.
    await block(page, "account").getByTestId("account-menu").click();
    const signOut = page.getByRole("menuitem", { name: "Sign out" });
    await expect(signOut).toBeInViewport();
    await page.keyboard.press("Escape");

    // A folder far down the list: its row is scrolled into view when its page opens.
    await scroller.evaluate((element) => element.scrollTo({ top: 0 }));
    await page.goto("/f/f29");
    const row = page.getByRole("treeitem", { name: /^Folder 30/ });
    await expect(row).toHaveAttribute("aria-current", "page");
    await expect
      .poll(async () => {
        const [own, area] = await Promise.all([box(row), box(scroller)]);
        return own.y >= area.y && own.y + own.height <= area.y + area.height;
      })
      .toBe(true);
  });
});

test("on a phone the blocks stack at the top, search and the theme toggle in the brand's", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Phones only.");
  await seedWorkspace(page, manyFolders(), "/folders");
  const header = page.getByTestId("sidebar-header");
  await expect(header.getByRole("button", { name: "Search projects and folders" })).toBeVisible();
  await expect(
    header.getByRole("button", { name: /^Switch to (dark|light) theme$/ }),
  ).toBeVisible();
  const [brand, nav, account] = await Promise.all([
    box(block(page, "brand")),
    box(block(page, "nav")),
    box(block(page, "account")),
  ]);
  expect(nav.y).toBeGreaterThan(brand.y + brand.height);
  expect(account.y).toBeGreaterThan(nav.y + nav.height);
});

test("the sidebar's mark is white on brand blue; elsewhere it keeps its colors", async ({
  page,
}) => {
  await seedWorkspace(page, manyFolders(), "/folders");
  const tile = block(page, "brand").locator("svg").first().locator("..");
  const blue = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--brand").trim(),
  );
  const background = await tile.evaluate((element) => getComputedStyle(element).backgroundColor);
  const hex = (rgb: string) =>
    `#${(rgb.match(/\d+/g) ?? [])
      .slice(0, 3)
      .map((part) => Number(part).toString(16).padStart(2, "0"))
      .join("")}`;
  expect(hex(background)).toBe(blue.toLowerCase());
  await expect(block(page, "brand").locator("svg path").first()).toHaveAttribute(
    "fill",
    "var(--color-on-brand)",
  );
});
