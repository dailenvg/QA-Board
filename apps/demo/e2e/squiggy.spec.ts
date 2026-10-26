import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Comment, CommentStatus, SquintData } from "../lib/store/types";
import {
  DEFAULT_FOLDER,
  mockFrameCheck,
  openOverview,
  seedWorkspace,
  showComments,
} from "./squint-fixtures";
import { WORKSPACE_SEED } from "./workspace-seed";

/** The Overview's Squiggy: the wrapper carries the mood as `data-mood`. */
function squiggy(page: Page): Locator {
  return page.getByTestId("squiggy");
}

/** Squiggy's poke button, named "Squiggy, <mood label>" (`idle` reads "relaxed"). */
function squiggyButton(page: Page, moodLabel: string): Locator {
  return squiggy(page).getByRole("button", { name: `Squiggy, ${moodLabel}`, exact: true });
}

function comment(id: string, projectId: string, pageId: string, status: CommentStatus): Comment {
  const at = Date.now();
  return {
    id,
    projectId,
    pageId,
    x: 20,
    y: 20,
    body: `Comment ${id}`,
    author: "Ada",
    status,
    createdAt: at,
    updatedAt: at,
    ...(status === "resolved" ? { resolvedAt: at } : {}),
  };
}

function withComments(comments: Comment[]): SquintData {
  return { ...WORKSPACE_SEED, comments, authorName: "Ada" };
}

interface Seen {
  moods: string[];
  lines: string[];
}

/**
 * Records every mood the Overview's Squiggy shows in this document, and every
 * line in its bubble, in order, without repeats.
 */
async function recordSquiggy(page: Page): Promise<() => Promise<Seen>> {
  await page.addInitScript(() => {
    const seen = { moods: [] as string[], lines: [] as string[] };
    (window as unknown as { __squiggy: typeof seen }).__squiggy = seen;
    const push = (list: string[], value: string | null | undefined) => {
      if (value && list[list.length - 1] !== value) list.push(value);
    };
    const record = () => {
      push(
        seen.moods,
        document.querySelector('[data-testid="squiggy"]')?.getAttribute("data-mood"),
      );
      push(seen.lines, document.querySelector('[data-testid="squiggy-speech"]')?.textContent);
    };
    new MutationObserver(record).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-mood"],
    });
  });
  return () => page.evaluate(() => (window as unknown as { __squiggy: Seen }).__squiggy);
}

test("an empty workspace sleeps until the first input, then Squiggy wakes up", async ({ page }) => {
  await openOverview(page);
  await expect(squiggy(page)).toHaveAttribute("data-mood", "sleeping");
  await expect(squiggyButton(page, "sleeping")).toBeVisible();

  await page.keyboard.press("Shift");
  await expect(squiggy(page)).toHaveAttribute("data-mood", "idle");
  await expect(squiggyButton(page, "relaxed")).toBeVisible();
});

test("with comments waiting, Squiggy thinks and its line links to their folder", async ({
  page,
}) => {
  await seedWorkspace(page, withComments([comment("c1", "nested", "nested-1", "active")]));
  await expect(squiggy(page)).toHaveAttribute("data-mood", "thinking");

  const line = page.getByTestId("squiggy-speech");
  const link = line.getByRole("link", { name: "1 comment waiting in Launch" });
  await expect(link).toHaveAttribute("href", "/f/launch");
  await link.click();
  await expect(page).toHaveURL(/\/f\/launch$/);
});

test("ten or more comments waiting surprise Squiggy", async ({ page }) => {
  const comments = Array.from({ length: 10 }, (_, index) =>
    comment(`c${index}`, "single", "single-1", "active"),
  );
  await seedWorkspace(page, withComments(comments));
  await expect(squiggy(page)).toHaveAttribute("data-mood", "surprised");
  await expect(page.getByTestId("squiggy-speech")).toHaveText(
    `10 comments waiting in ${DEFAULT_FOLDER.name}`,
  );
});

test("resolving the last comment: a celebration back on the Overview, then happy", async ({
  page,
}) => {
  const recorded = await recordSquiggy(page);
  await seedWorkspace(page, withComments([comment("c1", "single", "single-1", "active")]));
  await expect(squiggy(page)).toHaveAttribute("data-mood", "thinking");

  // Client-side all the way, so the Overview comes back within the reaction.
  await page.getByTestId("squiggy-speech").getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/f/${DEFAULT_FOLDER.id}$`));
  await page.getByRole("link", { name: /^Hero shot/ }).click();
  await expect(page).toHaveURL(/\/p\/single$/);
  await showComments(page);
  await page.getByTestId("comment-card").getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByTestId("toast")).toContainText("Comment resolved");

  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(squiggy(page)).toHaveAttribute("data-mood", "happy");
  await expect(page.getByTestId("squiggy-speech")).toHaveText(
    "All caught up. Every comment is resolved.",
  );

  const { moods, lines } = await recorded();
  const resolvedAt = moods.lastIndexOf("resolved");
  expect(resolvedAt, `moods seen: ${moods.join(", ")}`).toBeGreaterThan(moods.indexOf("thinking"));
  expect(moods[moods.length - 1]).toBe("happy");
  // The reaction's line, for the rest of its moment, then the workspace's.
  expect(lines.slice(-2), `lines seen: ${lines.join(" | ")}`).toEqual([
    "One down. Nice.",
    "All caught up. Every comment is resolved.",
  ]);
});

test("creating a project on the Overview: Squiggy listens, hops, then settles", async ({
  page,
}) => {
  await mockFrameCheck(page, {
    verdict: "embeddable",
    finalUrl: "https://example.com/",
    status: 200,
  });
  await openOverview(page);
  await page.getByTestId("overview-new-project").click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await expect(squiggy(page)).toHaveAttribute("data-mood", "listening");

  await dialog.getByLabel("Website address").fill("https://example.com/");
  await dialog.getByLabel("Project name").fill("Homepage");
  await dialog.getByTestId("create-project").click();
  await expect(dialog).toHaveCount(0);
  await expect(squiggy(page)).toHaveAttribute("data-mood", "happy");
  const line = page.getByTestId("squiggy-speech");
  await expect(line).toHaveText("Homepage is in and ready to review.");
  await expect(line.getByRole("link")).toHaveCount(0);

  // Then back to the usual subline: a project without comments has nothing specific to say.
  await expect(squiggy(page)).toHaveAttribute("data-mood", "idle");
  await expect(line).toHaveCount(0);
});

test("New project's shortcut opens the dialog, and Squiggy listens while it's open", async ({
  page,
}) => {
  await seedWorkspace(page, WORKSPACE_SEED);
  await expect(squiggy(page)).toHaveAttribute("data-mood", "idle");
  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog", { name: "New project" });
  await expect(dialog).toBeVisible();
  await expect(squiggy(page)).toHaveAttribute("data-mood", "listening");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(squiggy(page)).toHaveAttribute("data-mood", "idle");
});

test("hovering either New project button makes Squiggy listen", async ({ page, isMobile }) => {
  test.skip(isMobile, "Touch has no hover.");
  await seedWorkspace(page, WORKSPACE_SEED);
  await expect(squiggy(page)).toHaveAttribute("data-mood", "idle");

  for (const testId of ["overview-new-project", "new-project"]) {
    await page.getByTestId(testId).hover();
    await expect(squiggy(page)).toHaveAttribute("data-mood", "listening");
    await expect(squiggyButton(page, "listening")).toBeVisible();
    await page.mouse.move(1, 1);
    await expect(squiggy(page)).toHaveAttribute("data-mood", "idle");
  }
});

test("a minute without input puts Squiggy to sleep; any input wakes it", async ({ page }) => {
  await page.clock.install();
  await seedWorkspace(page, WORKSPACE_SEED);
  await expect(squiggy(page)).toHaveAttribute("data-mood", "idle");

  await page.clock.fastForward(60_000);
  await expect(squiggy(page)).toHaveAttribute("data-mood", "sleeping");
  await expect(squiggyButton(page, "sleeping")).toBeVisible();

  await page.keyboard.press("Shift");
  await expect(squiggy(page)).toHaveAttribute("data-mood", "idle");
});
