import type { Locator, Page } from "@playwright/test";
import { expect } from "./test";

/*
 * The default avatars as the specs read them: an <svg> with `data-mark` (its
 * kind), the light edge in a group of its own (shown in dark only), then the
 * art, the bubble (or a badge's square) first, in its literal color.
 */

/** A default mark of `kind`, its bubble (a badge's square) in `fill`, any case. */
export async function expectMark(mark: Locator, kind: string, fill: string): Promise<void> {
  await expect(mark).toHaveAttribute("data-mark", kind);
  await expect(mark.locator(":scope > path").first()).toHaveAttribute(
    "fill",
    new RegExp(`^${fill}$`, "i"),
  );
}

/** Whether a mark's light edge shows: in dark, never in light. */
export function edgeShows(mark: Locator): Promise<boolean> {
  return mark.locator(":scope > g").evaluate((node) => getComputedStyle(node).display !== "none");
}

/** Sets the app's theme and reloads, as the theme toggle leaves it for the next visit. */
export async function reloadInTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((value) => localStorage.setItem("squint:theme", value), theme);
  await page.reload();
  expect((await page.locator("html").getAttribute("data-theme")) === "dark").toBe(theme === "dark");
}

/** The badge's frame hangs off the avatar's bottom-left corner, on the side away from the tail. */
export async function expectBadgeBottomLeft(badge: Locator, avatar: Locator): Promise<void> {
  const frame = await badge.locator("..").boundingBox();
  const slot = await avatar.boundingBox();
  if (!frame || !slot) throw new Error("badge or avatar not laid out");
  expect(frame.x).toBeLessThan(slot.x + 2);
  expect(frame.x + frame.width).toBeLessThan(slot.x + slot.width / 2 + 1);
  expect(frame.y + frame.height).toBeGreaterThan(slot.y + slot.height - 2);
}
