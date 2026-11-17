import type { Page } from "@playwright/test";
import {
  ADMIN_FILL,
  AVATAR_INK,
  COMPANY_DEFAULT_FILL,
  personFill,
} from "../lib/avatar/default-avatar";
import { PAPER } from "../lib/brand-palette";
import { expect, test } from "./test";
import { sessionCookie, SIGNED_OUT } from "./auth-fixtures";
import { edgeShows, expectMark, reloadInTheme } from "./avatar-fixtures";
import { E2E_ADMIN } from "./e2e-env";
import { OWNER, openMembers, row, team } from "./members-fixtures";

/*
 * The default avatars (round 4, S1): a bubble in Squiggy's ink outline with
 * an icon breaking out of its top, standing free in its slot. A person
 * without a photo gets their pin color: head and shoulders beside the
 * company badge, their initials where no badge shows. A company without a
 * logo a building on its brand color (magenta without one), the admin a
 * shield on Pumpkin. In dark, a light edge rings each mark.
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
    await expectMark(olga, "person", personFill(OWNER));
    // Badged: head and shoulders, no initials for the badge to cover.
    await expect(olga).toHaveText("");
    await expect(olga.locator(":scope > path")).toHaveCount(3);
    expect(await edgeShows(olga), `${theme} edge`).toBe(theme === "dark");
    // No logo: the badge is drawn in place, the company's color with a solid building.
    const badge = sidebar.getByTestId("company-badge");
    await expectMark(badge, "company", COMPANY_DEFAULT_FILL);
    await expect(badge.locator("path")).toHaveCount(3);
    await expectMark(row(page, OWNER).getByTestId("member-initials"), "person", personFill(OWNER));
    await testInfo.attach(`sidebar-${theme}`, {
      body: await sidebar.screenshot(),
      contentType: "image/png",
    });

    // No badge on the photo editor's empty state: her initials under a small head.
    await page.goto("/account/profile");
    const editor = page.getByTestId("avatar-fallback").locator("svg");
    await expectMark(editor, "person", personFill(OWNER));
    await expect(editor).toHaveText("OO");
    expect(await edgeShows(editor), `${theme} edge`).toBe(theme === "dark");

    await page.goto("/");
    const header = page.getByTestId("workspace-header");
    const company = header.getByTestId("workspace-header-default");
    await expectMark(company, "company", COMPANY_DEFAULT_FILL);
    expect(await edgeShows(company), `${theme} edge`).toBe(theme === "dark");
    await testInfo.attach(`header-${theme}`, {
      body: await header.screenshot(),
      contentType: "image/png",
    });
  }

  // The badge's PNG twin, for link previews and the invite email: on its own light square.
  const icon = "/api/account/workspace/icon?v=0";
  expect(await pixel(page, icon, 4, 4)).toEqual(rgb("#EDEDEF"));
  expect(await pixel(page, icon, 44, 145)).toEqual(rgb(COMPANY_DEFAULT_FILL));

  // A dark brand color: the building turns paper with an ink outline.
  const branded = await page.request.patch("/api/account/workspace", {
    data: { name: "Harbor & Pine", brandColor: TEAL, senderName: null },
  });
  expect(branded.status()).toBe(200);
  await page.reload();
  const company = page.getByTestId("workspace-header-default");
  await expectMark(company, "company", TEAL);
  const building = company.locator(":scope > path").nth(1);
  await expect(building).toHaveAttribute("fill", PAPER);
  await expect(building).toHaveAttribute("stroke", AVATAR_INK);
  await expectMark(
    page.getByTestId("sidebar-account").getByTestId("company-badge"),
    "company",
    TEAL,
  );
  expect(await pixel(page, "/api/account/workspace/icon?v=1", 44, 145)).toEqual(rgb(TEAL));
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
    await expectMark(mark, "admin", ADMIN_FILL);
    expect(await edgeShows(mark), `${theme} edge`).toBe(theme === "dark");
    // Outside a workspace: no company, so no badge.
    await expect(page.getByTestId("company-badge")).toHaveCount(0);
    const editor = page.getByTestId("avatar-settings").getByTestId("avatar-fallback");
    await expectMark(editor.locator("svg"), "admin", ADMIN_FILL);
    await testInfo.attach(`admin-${theme}`, {
      body: await page.getByTestId("avatar-settings").screenshot(),
      contentType: "image/png",
    });

    await page.goto("/");
    await expectMark(
      page.getByTestId("no-workspace").getByTestId("account-initials"),
      "admin",
      ADMIN_FILL,
    );
  }
});
