import { expect, test, type Locator, type Page } from "@playwright/test";
import { EYE_LEFT_PATH, EYE_RIGHT_PATH } from "../components/brand/mascot/paths";
import { openOverview } from "./squint-fixtures";

const TITLES = ["Add a project", "Pin comments", "Resolve them"];

function stories(page: Page): Locator {
  return page.getByTestId("welcome-story");
}

function pauseToggle(page: Page): Locator {
  return page.getByRole("button", { name: "Pause animations", exact: true });
}

/** Every story's beat, to tell a moving bento from a frozen one. */
async function beats(page: Page): Promise<string[]> {
  return stories(page).evaluateAll((cards) => cards.map((card) => card.dataset.beat ?? ""));
}

/** Squiggy in each scene; `data-blinks="false"` while its frame holds still. */
function mascots(page: Page): Locator {
  return page.getByTestId("story-mascot");
}

/** Emulates switching to another tab (or back) by faking the Page Visibility API. */
async function setTabHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((isHidden) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => isHidden });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (isHidden ? "hidden" : "visible"),
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

/** Squiggy's eyes inside the scenes, found by their path data. */
const SCENE_EYES = [EYE_LEFT_PATH, EYE_RIGHT_PATH]
  .map((d) => `[data-testid="story-mascot"] path[d="${d}"]`)
  .join(", ");

/**
 * Starts counting style changes on the scenes' mascot eyes (a blink squashes an
 * eye's scale). Returns a reader for the count so far.
 */
async function watchMascotEyes(page: Page): Promise<() => Promise<number>> {
  await expect(page.locator(SCENE_EYES).first()).toBeAttached();
  await page.evaluate((selector) => {
    const target = window as unknown as { __eyeChanges: number };
    target.__eyeChanges = 0;
    const observer = new MutationObserver((records) => {
      target.__eyeChanges += records.length;
    });
    for (const eye of document.querySelectorAll(selector)) {
      observer.observe(eye, { attributes: true, attributeFilter: ["style"] });
    }
  }, SCENE_EYES);
  return () => page.evaluate(() => (window as unknown as { __eyeChanges: number }).__eyeChanges);
}

/** Each story shows its last beat: the finished frame. */
async function expectFinishedFrames(page: Page): Promise<void> {
  for (const card of await stories(page).all()) {
    await expect(card).toHaveAttribute(
      "data-beat",
      (await card.getAttribute("data-last-beat")) ?? "",
    );
  }
}

test("the welcome tells three stories, in order, then offers one way to start", async ({
  page,
}) => {
  await openOverview(page);
  const panel = page.getByTestId("overview-empty");
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText("How it works");
  const list = page.getByTestId("welcome-stories");
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(list.getByRole("heading", { level: 3 })).toHaveText(TITLES);
  for (const [index, title] of TITLES.entries()) {
    const card = stories(page).nth(index);
    await expect(card).toContainText(`Step ${index + 1}`);
    await expect(card).toContainText(title);
  }

  // The cards explain; the panel's one action, below them, starts.
  await expect(list.getByRole("button")).toHaveCount(0);
  await page.getByTestId("overview-empty-action").click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
});

test("Pause stops the stories, is remembered for the visit, and Play starts them again", async ({
  page,
}) => {
  await openOverview(page);
  const first = stories(page).first();
  await first.scrollIntoViewIfNeeded();
  await expect(first).toHaveAttribute("data-playing", "true");
  await expect(first.getByTestId("story-mascot")).toHaveAttribute("data-blinks", "true");
  await expect(pauseToggle(page)).toHaveAttribute("aria-pressed", "false");

  await pauseToggle(page).click();
  await expect(pauseToggle(page)).toHaveAttribute("aria-pressed", "true");
  await expect(stories(page).and(page.locator('[data-playing="true"]'))).toHaveCount(0);
  // A paused frame holds fully still: Squiggy stops blinking too.
  await expect(mascots(page).first()).toBeAttached();
  await expect(mascots(page).and(page.locator('[data-blinks="true"]'))).toHaveCount(0);
  const frozen = await beats(page);
  await page.waitForTimeout(1500);
  expect(await beats(page)).toEqual(frozen);

  // Paused on arrival: each story shows how it ends rather than a blank start.
  await page.reload();
  await expect(pauseToggle(page)).toHaveAttribute("aria-pressed", "true");
  await expectFinishedFrames(page);

  await pauseToggle(page).click();
  await expect(pauseToggle(page)).toHaveAttribute("aria-pressed", "false");
  await first.scrollIntoViewIfNeeded();
  await expect(first).toHaveAttribute("data-playing", "true");
});

test("only the stories on screen play; scrolling one into view starts it", async ({ page }) => {
  const width = page.viewportSize()?.width ?? 1280;
  // Short enough that the last story starts fully below the fold in every layout.
  await page.setViewportSize({ width, height: 400 });
  await openOverview(page);
  const last = stories(page).last();
  await expect(last).toBeAttached();
  const offscreen = await last.evaluate((card) => card.getBoundingClientRect().top >= innerHeight);
  expect(offscreen, "the last story starts below the fold").toBe(true);
  await expect(last).toHaveAttribute("data-playing", "false");

  await last.scrollIntoViewIfNeeded();
  await expect(last).toHaveAttribute("data-playing", "true");
});

test("a hidden tab holds the stories, Squiggy's eyes included, and showing it resumes them", async ({
  page,
}) => {
  await page.clock.install();
  await openOverview(page);
  // Pin comments: by 5 s in, its story is on the comment beat, with Squiggy talking (a blinking mood).
  const pin = stories(page).nth(1);
  await pin.scrollIntoViewIfNeeded();
  await expect(pin).toHaveAttribute("data-playing", "true");
  await page.clock.runFor(5000);
  await expect(pin.getByTestId("story-mascot")).toHaveAttribute("data-blinks", "true");

  await setTabHidden(page, true);
  await expect(stories(page).and(page.locator('[data-playing="true"]'))).toHaveCount(0);
  await expect(mascots(page).and(page.locator('[data-blinks="true"]'))).toHaveCount(0);
  // Let Squiggy settle into its held pose; from then on no beat advances and no eye blinks.
  await page.clock.runFor(2000);
  const frozen = await beats(page);
  const eyeChanges = await watchMascotEyes(page);
  await page.clock.runFor(12_000);
  expect(await beats(page)).toEqual(frozen);
  expect(await eyeChanges()).toBe(0);

  await setTabHidden(page, false);
  await expect(pin).toHaveAttribute("data-playing", "true");
  await page.clock.runFor(2000);
  await expect.poll(() => beats(page)).not.toEqual(frozen);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("each story shows its finished frame, still, with nothing to pause", async ({ page }) => {
    await openOverview(page);
    await expect(stories(page)).toHaveCount(3);
    await expectFinishedFrames(page);
    await expect(pauseToggle(page)).toHaveCount(0);
    await expect(mascots(page)).toHaveCount(3);
    await expect(mascots(page).and(page.locator('[data-blinks="true"]'))).toHaveCount(0);

    const add = stories(page).nth(0);
    const pin = stories(page).nth(1);
    const resolve = stories(page).nth(2);
    await expect(add.getByTestId("story-snapshot")).toBeVisible();
    await expect(pin.getByTestId("story-pin")).toBeVisible();
    await expect(pin.getByTestId("story-comment")).toContainText("Make this button bigger");
    await expect(resolve.getByTestId("story-pin")).toHaveAttribute("data-resolved", "true");
    await expect(resolve.getByTestId("story-toast")).toBeVisible();

    // Pin and Resolve are one comment's story: same commenter, same pin color.
    const author = await pin.getByTestId("story-comment").getAttribute("data-author");
    const color = await pin.getByTestId("story-pin").getAttribute("data-color");
    expect(author).toBeTruthy();
    expect(color).toBeTruthy();
    await expect(resolve.getByTestId("story-comment")).toHaveAttribute("data-author", author ?? "");
    await expect(resolve.getByTestId("story-pin")).toHaveAttribute("data-color", color ?? "");

    const settled = await beats(page);
    await page.waitForTimeout(1200);
    expect(await beats(page)).toEqual(settled);
  });
});
