import type { Page } from "@playwright/test";
import { AVATAR_FILL, AVATAR_TILE } from "../lib/avatar/default-avatar";
import { expect, test } from "./test";
import { sessionCookie, SIGNED_OUT } from "./auth-fixtures";
import { edgeShows, expectMark, reloadInTheme } from "./avatar-fixtures";
import { E2E_ADMIN } from "./e2e-env";
import { OWNER, openMembers, row, team } from "./members-fixtures";

/*
 * The default avatars: a gray bubble in a Gunmetal outline with an icon
 * breaking out of its top, standing free in its slot, every one on Pale
 * Steel. A person without a photo gets head and shoulders, a company without
 * a logo a building whatever its brand color, the admin a shield with a
 * person cut out. In dark, a light edge rings each mark.
 */

test.use({ storageState: SIGNED_OUT });

const THEMES = ["light", "dark"] as const;
const TEAL = "#0f766e";

/** The RGB of the pixel at (`x`, `y`) of the image at `src`, as the browser decodes it. */
function pixel(page: Page, src: string, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    async ({ url, at }) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no canvas");
      context.drawImage(image, 0, 0);
      return Array.from(context.getImageData(at.x, at.y, 1, 1).data.slice(0, 3));
    },
    { url: src, at: { x, y } },
  );
}

const rgb = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

// Tagged `@webkit`: Safari and iOS run these too, for the SVG text and the dark-only edge.
test("a member without a photo and a company without a logo show their default marks, light and dark @webkit", async ({
  page,
  baseURL,
}, testInfo) => {
  await team(page, testInfo.project.name, baseURL);
  for (const theme of THEMES) {
    await page.goto("/account/members");
    await reloadInTheme(page, theme);
    await openMembers(page);
    const sidebar = page.getByTestId("sidebar-account");
    const olga = sidebar.getByTestId("account-initials");
    await expectMark(olga, "person", AVATAR_FILL);
    // Head and shoulders, never initials.
    await expect(olga).toHaveText("");
    await expect(olga.locator(":scope > path")).toHaveCount(3);
    expect(await edgeShows(olga), `${theme} edge`).toBe(theme === "dark");
    // No logo: the badge is drawn in place, Pale Steel with a solid building.
    const badge = sidebar.getByTestId("company-badge");
    await expectMark(badge, "company", AVATAR_FILL);
    await expect(badge.locator("path")).toHaveCount(3);
    await expectMark(row(page, OWNER).getByTestId("member-initials"), "person", AVATAR_FILL);
    await testInfo.attach(`sidebar-${theme}`, {
      body: await sidebar.screenshot(),
      contentType: "image/png",
    });

    // The photo editor's empty state: the same mark, large.
    await page.goto("/account/profile");
    const editor = page.getByTestId("avatar-fallback").locator("svg");
    await expectMark(editor, "person", AVATAR_FILL);
    await expect(editor).toHaveText("");
    expect(await edgeShows(editor), `${theme} edge`).toBe(theme === "dark");

    await page.goto("/");
    const header = page.getByTestId("workspace-header");
    const company = header.getByTestId("workspace-header-default");
    await expectMark(company, "company", AVATAR_FILL);
    expect(await edgeShows(company), `${theme} edge`).toBe(theme === "dark");
    await testInfo.attach(`header-${theme}`, {
      body: await header.screenshot(),
      contentType: "image/png",
    });
  }

  // The badge's PNG twin, for link previews and the invite email: on its own light square.
  const icon = "/api/account/workspace/icon?v=0";
  expect(await pixel(page, icon, 4, 4)).toEqual(rgb(AVATAR_TILE));
  expect(await pixel(page, icon, 44, 145)).toEqual(rgb(AVATAR_FILL));

  // A brand color leaves the marks gray.
  const branded = await page.request.patch("/api/account/workspace", {
    data: { name: "Harbor & Pine", brandColor: TEAL, senderName: null },
  });
  expect(branded.status()).toBe(200);
  await page.reload();
  await expectMark(page.getByTestId("workspace-header-default"), "company", AVATAR_FILL);
  await expectMark(
    page.getByTestId("sidebar-account").getByTestId("company-badge"),
    "company",
    AVATAR_FILL,
  );
  expect(await pixel(page, "/api/account/workspace/icon?v=1", 44, 145)).toEqual(rgb(AVATAR_FILL));
});

test("the admin without a photo shows the admin mark, light and dark @webkit", async ({
  page,
  baseURL,
}, testInfo) => {
  // A session of its own: login.spec changes the admin's password.
  await page.context().addCookies([await sessionCookie(E2E_ADMIN.email, baseURL ?? "")]);
  for (const theme of THEMES) {
    await page.goto("/account/profile");
    await reloadInTheme(page, theme);
    await expect(page.getByTestId("account-shell")).toBeVisible();
    // The account card beside the settings: the admin's own mark.
    const mark = page.getByTestId("account-initials");
    await expectMark(mark, "admin", AVATAR_FILL);
    expect(await edgeShows(mark), `${theme} edge`).toBe(theme === "dark");
    // Outside a workspace: no company, so no badge.
    await expect(page.getByTestId("company-badge")).toHaveCount(0);
    const editor = page.getByTestId("avatar-settings").getByTestId("avatar-fallback");
    await expectMark(editor.locator("svg"), "admin", AVATAR_FILL);
    await testInfo.attach(`admin-${theme}`, {
      body: await page.getByTestId("avatar-settings").screenshot(),
      contentType: "image/png",
    });

    await page.goto("/");
    await expectMark(
      page.getByTestId("no-workspace").getByTestId("account-initials"),
      "admin",
      AVATAR_FILL,
    );
  }
});
