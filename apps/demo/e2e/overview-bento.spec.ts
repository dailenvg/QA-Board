import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./test";
import type { Comment, SquintData } from "../lib/store/types";
import {
  DEFAULT_FOLDER,
  openOverview,
  seedWorkspace,
  settled,
  shareWorkspaceProject,
} from "./squint-fixtures";
import { addWaitingClientComment, storeProjects } from "./workspace-db";
import { WORKSPACE_SEED } from "./workspace-seed";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function sidebar(page: Page): Locator {
  return page.getByRole("complementary", { name: "Workspace" });
}

function tab(page: Page, name: "Overview" | "Folders"): Locator {
  return sidebar(page).getByRole("link", { name, exact: true });
}

function folderRow(page: Page, name: string): Locator {
  return page.getByRole("treeitem", { name: new RegExp(`^${name} \\d`) });
}

function tile(page: Page, name: "waiting" | "clients" | "recent" | "status" | "leaving") {
  return page.getByTestId(`tile-${name}`);
}

function comment(
  id: string,
  projectId: string,
  pageId: string,
  hoursAgo: number,
  extra: Partial<Comment> = {},
): Comment {
  const at = Date.now() - hoursAgo * HOUR;
  return {
    id,
    projectId,
    pageId,
    x: 20,
    y: 20,
    body: `Comment ${id}`,
    author: "Ada",
    status: "active",
    createdAt: at,
    updatedAt: at,
    ...extra,
  };
}

/**
 * The seed with comments: three open (two in My projects, one by a client in Launch, three
 * folders down) and one resolved. Comments by anyone but `authorName` import as a client's.
 */
const WITH_COMMENTS: SquintData = {
  ...WORKSPACE_SEED,
  authorName: "Ada",
  comments: [
    comment("oldest", "deck", "deck-1", 48, { body: "Swap the cover photo" }),
    comment("team", "single", "single-1", 3),
    comment("done", "single", "single-1", 2, { status: "resolved", resolvedAt: Date.now() }),
    comment("pulled", "nested", "nested-1", 1, { author: "Cleo" }),
  ],
};

/**
 * Archives two projects straight in the workspace (in a Stored folder of their own): one due
 * to be deleted for good in about 4 days, one in about 20. Reload to see them.
 */
async function archiveTwo(): Promise<void> {
  const archivedDaysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();
  await storeProjects([
    { id: "later", name: "Summer flyer", archivedAt: archivedDaysAgo(10), files: [] },
    { id: "soon", name: "Old landing", archivedAt: archivedDaysAgo(26), files: [] },
  ]);
}

/** WITH_COMMENTS, plus a shared project whose client left a comment it hasn't pulled yet. */
async function seedActivity(page: Page): Promise<string> {
  await seedWorkspace(page, WITH_COMMENTS, "/sandbox");
  const { projectId } = await shareWorkspaceProject(page, "Shared site");
  await addWaitingClientComment(projectId, {
    id: "waiting",
    body: "Is this the final logo?",
    author: "Cleo",
    createdAt: Date.now(),
  });
  return projectId;
}

test("Overview and Folders are tabs; Folders opens the folder list and keeps its place", async ({
  page,
}) => {
  await seedWorkspace(page, WORKSPACE_SEED);
  const toggle = page.getByTestId("folders-toggle");
  await expect(tab(page, "Overview")).toHaveAttribute("aria-current", "page");
  await expect(tab(page, "Folders")).not.toHaveAttribute("aria-current");
  // Closed on the Overview, its arrow opens it anywhere.
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("tree")).toHaveCount(0);
  const box = await toggle.boundingBox();
  expect(box && box.width >= 44 && box.height >= 44).toBe(true);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("tree")).toBeVisible();
  await expect(page.getByRole("tree")).toHaveAccessibleName("Folders");
  await toggle.click();
  await expect(page.getByRole("tree")).toHaveCount(0);

  // Folders: the tab is the page, and the list opens by itself.
  await tab(page, "Folders").click();
  await expect(page).toHaveURL(/\/folders$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Folders");
  await expect(tab(page, "Folders")).toHaveAttribute("aria-current", "page");
  await expect(tab(page, "Overview")).not.toHaveAttribute("aria-current");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  // A folder's page: its row is the page, Folders the section it's in.
  await folderRow(page, "Café menus").click();
  await expect(page).toHaveURL(/\/f\/cafe$/);
  await expect(folderRow(page, "Café menus")).toHaveAttribute("aria-current", "page");
  await expect(tab(page, "Folders")).toHaveAttribute("aria-current", "true");

  // Back on the Overview, the list closes again.
  await tab(page, "Overview").click();
  await expect(page.getByTestId("overview-bento")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // The account settings mark neither tab.
  await page.goto("/account/profile");
  await expect(tab(page, "Overview")).not.toHaveAttribute("aria-current");
  await expect(tab(page, "Folders")).not.toHaveAttribute("aria-current");

  await page.goto("/folders");
  const axe = await new AxeBuilder({ page })
    .include('[aria-label="Workspace navigation"]')
    .analyze();
  expect(axe.violations.map(({ id, nodes }) => ({ id, nodes: nodes.length }))).toEqual([]);
});

test("Folders shows the folder grid and its sort; the Overview doesn't", async ({ page }) => {
  await seedWorkspace(page, WORKSPACE_SEED, "/folders");
  await expect(page.getByTestId("folder-card")).toHaveCount(3);
  await expect(page.getByTestId("sort-menu")).toHaveAccessibleName("Sort: Last updated");
  await expect(page.getByTestId("folders-header")).toContainText("3 folders");
  await expect(page.getByTestId("folders-header")).toContainText("6 projects");
  // Search is here too, as on every workspace page.
  await expect(page.getByRole("search")).toHaveCount(1);

  await tab(page, "Overview").click();
  await expect(page.getByTestId("overview-bento")).toBeVisible();
  await expect(page.getByTestId("folder-card")).toHaveCount(0);
  await expect(page.getByTestId("workspace-header")).toBeVisible();
});

test("the bento counts comments, client news, recent projects and what's deleting soon", async ({
  page,
}) => {
  const sharedId = await seedActivity(page);
  await archiveTwo();
  await openOverview(page);

  await expect(tile(page, "status")).toHaveAttribute("data-open", "3");
  await expect(tile(page, "status")).toHaveAttribute("data-resolved", "1");
  await expect(page.getByTestId("status-open")).toHaveText("3");
  await expect(page.getByTestId("status-resolved")).toHaveText("1");

  // Oldest first, each opening its project; the client's is marked.
  const waiting = tile(page, "waiting");
  await expect(waiting).toHaveAttribute("data-count", "3");
  await expect(waiting.getByTestId("waiting-row")).toHaveCount(3);
  await expect(waiting.getByTestId("waiting-row").first()).toContainText("Pitch deck");
  await expect(waiting.getByTestId("waiting-row").first()).toContainText("Swap the cover photo");
  await expect(waiting.getByTestId("waiting-row").last()).toContainText("Client");

  // A first visit: the last week's client comments, pulled and still on the review link.
  const clients = tile(page, "clients");
  await expect(clients).toHaveAttribute("data-count", "2");
  await expect(clients.getByTestId("clients-waiting")).toHaveText(
    "1 comment is still on its review link. Open the project to bring it in.",
  );
  await expect(clients.getByTestId("client-row")).toHaveText([
    /^Shared site\s*1 new/,
    /^Spring Campaign Banner\s*1 new/,
  ]);

  // Newest first, all new on a first visit.
  const recent = tile(page, "recent").getByTestId("recent-row");
  await expect(recent.first()).toContainText("Shared site");
  await expect(recent.first().getByTestId("new-mark")).toBeVisible();

  // Archived projects, the one deleted for good soonest first; the rest of the bento leaves them out.
  const leaving = tile(page, "leaving");
  await expect(leaving).toHaveAttribute("data-count", "2");
  await expect(leaving.getByTestId("leaving-row")).toHaveText([
    /^Old landing\s*Deletes for good on .+in 4 days/,
    /^Summer flyer\s*Deletes for good on .+in 20 days/,
  ]);
  await expect(leaving.getByTestId("leaving-row").first()).toHaveAttribute("href", "/p/soon");
  await expect(tile(page, "recent")).not.toContainText("Old landing");

  // The client row opens its project.
  await clients.getByTestId("client-row").first().click();
  await expect(page).toHaveURL(new RegExp(`/p/${sharedId}$`));
});

test("what came in before the last visit isn't new any more", async ({ page }) => {
  await seedActivity(page);
  await openOverview(page);
  await expect(tile(page, "clients")).toHaveAttribute("data-count", "2");
  await expect(tile(page, "recent").getByTestId("new-mark").first()).toBeVisible();

  await page.reload();
  await expect(tile(page, "clients")).toHaveAttribute("data-count", "0");
  await expect(tile(page, "clients")).toContainText("No new client comments");
  await expect(tile(page, "recent").getByTestId("new-mark")).toHaveCount(0);
});

test("a tile opens what it's about", async ({ page }) => {
  await seedWorkspace(page, WITH_COMMENTS);
  await tile(page, "waiting").getByTestId("waiting-row").first().click();
  await expect(page).toHaveURL(/\/p\/deck$/);

  await archiveTwo();
  await page.goto("/");
  await tile(page, "leaving").getByTestId("leaving-row").first().click();
  await expect(page).toHaveURL(/\/p\/soon$/);
});

test("tiles without anything to show say so", async ({ page }) => {
  await seedWorkspace(page, WORKSPACE_SEED);
  await expect(tile(page, "waiting").getByTestId("tile-empty")).toHaveText(/^No comments waiting/);
  await expect(tile(page, "status").getByTestId("tile-empty")).toHaveText(/^No comments yet/);
  await expect(tile(page, "clients").getByTestId("tile-empty")).toHaveText(
    /^No new client comments/,
  );
  await expect(tile(page, "leaving").getByTestId("tile-empty")).toHaveText(/^Nothing to delete/);

  // Every tile fully in (each rises in as it's scrolled to), so axe sees real colors.
  for (const name of ["status", "waiting", "clients", "recent", "leaving"] as const) {
    await tile(page, name).scrollIntoViewIfNeeded();
  }
  await settled(page.getByTestId("overview-bento").getByRole("heading"));
  const axe = await new AxeBuilder({ page }).include('[data-testid="overview-bento"]').analyze();
  expect(axe.violations.map(({ id, nodes }) => ({ id, nodes: nodes.length }))).toEqual([]);
});

test("an empty workspace keeps the welcome and its stories instead of the bento", async ({
  page,
}) => {
  await openOverview(page);
  await expect(page.getByTestId("overview-empty")).toBeVisible();
  await expect(page.getByTestId("welcome-stories")).toBeVisible();
  await expect(page.getByTestId("overview-bento")).toHaveCount(0);
});

/** Every tile with its illustrated scene, besides the hero. */
const SCENE_TILES = ["waiting", "clients"] as const;

test("the hero, comments waiting and client news have scenes, hidden from screen readers, that play again on hover", async ({
  page,
  isMobile,
}) => {
  await seedActivity(page);
  await openOverview(page);
  for (const name of SCENE_TILES) {
    const scene = tile(page, name).getByTestId("tile-scene");
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toHaveAttribute("aria-hidden", "true");
  }
  await expect(page.getByTestId("overview-hero").getByTestId("tile-scene")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  // A client's cursor drops a pin per new comment; a bubble queues up per waiting comment.
  const clients = tile(page, "clients").getByTestId("tile-scene");
  await expect(clients.getByTestId("story-pin")).toHaveCount(2);
  await expect(tile(page, "waiting").getByTestId("scene-bubble")).toHaveCount(3);
  // One-off entrances, never a loop: there's nothing to pause anywhere in the bento.
  await expect(page.getByRole("button", { name: "Pause animations" })).toHaveCount(0);

  // Every row has its project's thumbnail and an arrow; on a pointer, hovering tints the row
  // without moving it, and hovering a card plays its scene again (the pins drop anew).
  const row = tile(page, "recent").getByTestId("recent-row").first();
  await expect(row.locator("svg")).not.toHaveCount(0);
  if (isMobile) return;
  await row.hover();
  // The arrow's nudge has had time to play, so the row would have moved by now.
  await expect
    .poll(() =>
      row
        .locator("span")
        .last()
        .evaluate((el) => getComputedStyle(el).transform),
    )
    .not.toBe("none");
  expect(await row.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
  await expect(clients).toHaveAttribute("data-run", "0");
  await page.mouse.move(0, 0);
  // A replay waits for the play under way to end (each takes at most 0.8s).
  await page.waitForTimeout(900);
  await tile(page, "clients").hover({ position: { x: 20, y: 20 } });
  await expect(clients).toHaveAttribute("data-run", "1");
  await expect(clients.getByTestId("story-pin")).toHaveCount(2);
});

/**
 * Every color drawn in the scenes, outside Squiggy, that isn't a grey (`.scene-grey` and the
 * line art), and whether Squiggy, in the scenes it peeks into, still has its colors.
 */
async function sceneColors(page: Page): Promise<{ colored: string[]; squiggy: boolean }> {
  return page.evaluate(() => {
    /** How far a computed color is from grey: its channel spread, or its oklab chroma. */
    const chroma = (value: string): number => {
      const numbers = (value.match(/-?\d*\.?\d+/g) ?? []).map(Number);
      if (value.startsWith("oklab")) return Math.hypot(numbers[1] ?? 0, numbers[2] ?? 0) * 255;
      if (!value.startsWith("rgb")) return 0;
      const [r = 0, g = 0, b = 0, alpha = 1] = numbers;
      return alpha === 0 ? 0 : Math.max(r, g, b) - Math.min(r, g, b);
    };
    const colored: string[] = [];
    let squiggy = false;
    for (const scene of document.querySelectorAll('[data-testid="tile-scene"]')) {
      for (const element of scene.querySelectorAll("*")) {
        const style = getComputedStyle(element);
        const paints = [style.backgroundColor, style.color, style.fill, style.stroke];
        if (element.closest('[data-testid="story-mascot"]')) {
          squiggy ||= paints.some((paint) => chroma(paint) > 40);
        } else {
          colored.push(...paints.filter((paint) => chroma(paint) > 12));
        }
      }
    }
    return { colored, squiggy };
  });
}

test("the scenes are drawn in grey lines, Squiggy the only color in them", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Phones hide the hero's project page.");
  await seedActivity(page);
  await openOverview(page);
  for (const name of SCENE_TILES) await tile(page, name).scrollIntoViewIfNeeded();
  // Open pins and the resolved one on the hero's page, client pins, the pile, and the line
  // art's lime Squiggy on the hero's page and on the pile.
  const hero = page.getByTestId("overview-hero").getByTestId("tile-scene");
  await expect(hero.getByTestId("story-pin")).toHaveCount(4);
  await expect(hero.locator('[data-testid="story-pin"][data-resolved]')).toHaveCount(1);
  for (const scene of [hero, tile(page, "waiting").getByTestId("tile-scene")]) {
    await expect(scene.getByTestId("story-mascot").locator("path").first()).toHaveCSS(
      "fill",
      "rgb(222, 255, 91)",
    );
  }
  await expect(tile(page, "clients").getByTestId("story-pin")).toHaveCount(2);
  await expect(tile(page, "waiting").getByTestId("scene-bubble")).toHaveCount(3);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    expect(await sceneColors(page), theme).toEqual({ colored: [], squiggy: true });
  }
});

/** React's hydration failures (#418 text, #423 recovery, #425 text content) or warnings. */
const HYDRATION = /#418|#423|#425|hydrat/i;

/** Every page error and console error from here on, for checking after the page settles. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

/**
 * Loads the Overview, then reloads it: no hydration error either time. The first load draws
 * the client pins; on the reload they came in before the last visit, so there are none.
 */
async function expectCleanHydration(page: Page): Promise<void> {
  const errors = collectErrors(page);
  for (const [load, pins] of [
    [() => openOverview(page), 2],
    [() => page.reload(), 0],
  ] as const) {
    await load();
    // Set by an effect after hydration (the last visit is read then): hydration is over.
    await expect(tile(page, "clients")).toHaveAttribute("data-count", String(pins));
    expect(errors.filter((text) => HYDRATION.test(text))).toEqual([]);
    // A scene draws once it's scrolled to (on phones the tile is below the fold).
    await tile(page, "clients").scrollIntoViewIfNeeded();
    await expect(tile(page, "clients").getByTestId("story-pin")).toHaveCount(pins);
  }
}

test("the Overview hydrates without a mismatch", async ({ page }) => {
  await seedActivity(page);
  await expectCleanHydration(page);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the Overview still hydrates without a mismatch", async ({ page }) => {
    // The server can't know the preference: scenes drawn at once must wait for hydration.
    await seedActivity(page);
    await expectCleanHydration(page);
  });

  test("everything shows its final state at once", async ({ page }) => {
    await seedActivity(page);
    await openOverview(page);
    // No count-up: the numbers are already there.
    await expect(page.getByTestId("status-open")).toHaveText("3");
    // Scenes are drawn at their last frame without waiting to be scrolled to.
    await expect(tile(page, "clients").getByTestId("story-pin")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Pause animations" })).toHaveCount(0);
  });
});

test("every count tag wears the file-type tag's lime", async ({ page }) => {
  await seedActivity(page);
  await page.goto(`/f/${DEFAULT_FOLDER.id}`);
  const typeTag = page.getByTestId("project-type-tag").first();
  const style = (locator: Locator) =>
    locator.evaluate((element) => {
      const { backgroundColor, color, height, borderRadius } = getComputedStyle(element);
      return { backgroundColor, color, height, borderRadius };
    });
  const expected = await style(typeTag);
  await openOverview(page);
  const tags = page.getByTestId("overview-bento").getByTestId("tile-tag");
  await expect(tags).toHaveCount(5);
  for (const tag of await tags.all()) expect(await style(tag)).toEqual(expected);
});

/**
 * Rows and "+N more" links that stick out of the box their list clips to: [] when every one
 * shown is whole. Each list's box is its `<ol>`'s parent.
 */
async function cutOffInLists(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const cut: string[] = [];
    for (const name of ["waiting", "clients", "recent", "leaving"]) {
      const parent = document.querySelector(`[data-testid="tile-${name}"] ol`)?.parentElement;
      if (!parent) continue;
      const box = parent.getBoundingClientRect();
      const shown = parent.querySelectorAll('[data-testid$="-row"], [data-testid="tile-more"]');
      for (const element of shown) {
        const { top, bottom } = element.getBoundingClientRect();
        if (top < box.top - 1 || bottom > box.bottom + 1)
          cut.push(`${name}: ${element.textContent}`);
      }
    }
    return cut;
  });
}

async function expectFitsOneScreen(page: Page, height: number) {
  await expect(tile(page, "leaving")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => (document.scrollingElement?.scrollHeight ?? 0) <= window.innerHeight),
    )
    .toBe(true);
  for (const name of ["status", "waiting", "clients", "recent", "leaving"] as const) {
    const box = await tile(page, name).boundingBox();
    expect(box && box.y + box.height <= height, name).toBe(true);
  }
  // Only whole rows, and "+N more" whole or not at all (polled: lists settle once measured).
  await expect.poll(() => cutOffInLists(page)).toEqual([]);
  // Each scene fits inside its card.
  const scenes = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="tile-scene"]')].flatMap((scene) => {
      const card = scene.closest("section, a")?.getBoundingClientRect();
      const own = scene.getBoundingClientRect();
      if (!card || own.height === 0) return [];
      const inside =
        own.top >= card.top - 1 &&
        own.bottom <= card.bottom + 1 &&
        own.left >= card.left - 1 &&
        own.right <= card.right + 1;
      return inside ? [] : [scene.closest("section, a")?.getAttribute("data-testid")];
    }),
  );
  expect(scenes).toEqual([]);
}

test.describe("on a wide window tall enough for it", () => {
  test.describe("1280×800", () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("the bento fits one screen, its lists showing the whole rows that fit", async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, "Phones stack the tiles and scroll.");
      await seedActivity(page);
      await openOverview(page);
      await expectFitsOneScreen(page, 800);
      await expect(tile(page, "recent").getByTestId("recent-row").first()).toBeVisible();
    });
  });

  test.describe("1536×864", () => {
    test.use({ viewport: { width: 1536, height: 864 } });

    test("lists that don't all fit end in a link to the rest", async ({ page, isMobile }) => {
      test.skip(isMobile, "Phones stack the tiles and scroll.");
      await seedActivity(page);
      await openOverview(page);
      await expectFitsOneScreen(page, 864);
      // Seven projects don't all fit: the rest are a link away.
      const more = tile(page, "recent").getByTestId("tile-more");
      await expect(more).toHaveText(/^\+\d+ more in Folders$/);
      await expect(more).toHaveAttribute("href", "/folders");
    });
  });
});
