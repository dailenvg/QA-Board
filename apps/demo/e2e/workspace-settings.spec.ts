import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./test";
import { SIGNED_OUT } from "./auth-fixtures";
import { E2E_COMPANY } from "./e2e-env";
import { snapshotPng } from "./sample-snapshot";
import { mockFrameCheck, shareWorkspaceProject } from "./squint-fixtures";
import { logoRow } from "./workspace-db";

const PROJECT = "Spring launch";

/** A picked file, as the uploader's hidden input receives it. */
function png(width: number, height: number) {
  return { name: "picked.png", mimeType: "image/png", buffer: snapshotPng(width, height) };
}

/** The decoded size of an image once it has loaded. */
async function naturalSize(image: Locator): Promise<[number, number]> {
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.complete))
    .toBe(true);
  return image.evaluate((element: HTMLImageElement) => [
    element.naturalWidth,
    element.naturalHeight,
  ]);
}

/** A logo sits on its white backing tile, so a dark logo still shows on dark surfaces. */
async function expectLightBacking(image: Locator) {
  await expect(image.locator("..")).toHaveCSS("background-color", "rgb(255, 255, 255)");
}

/** Opens a review link as a guest: a browser of its own, signed out. */
async function openAsGuest(page: Page, baseURL: string | undefined, token: string) {
  const context = await page.context().browser()?.newContext({ storageState: SIGNED_OUT });
  if (!context) throw new Error("no browser");
  const guest = await context.newPage();
  await mockFrameCheck(guest, {
    verdict: "embeddable",
    finalUrl: `${baseURL}/sandbox`,
    status: 200,
  });
  await guest.goto(`/s/${token}`);
  await expect(guest.getByRole("heading", { level: 1, name: PROJECT })).toBeVisible();
  await guest.keyboard.press("Escape");
  return { guest, close: () => context.close() };
}

test("the owner names the workspace and picks a color and sender name, previewed before saving", async ({
  page,
}) => {
  await page.goto("/account/workspace");
  const section = page.getByRole("navigation", { name: "Account settings" });
  await expect(section.getByRole("link", { name: "Workspace" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const card = page.getByTestId("workspace-brand-settings");
  const preview = card.getByTestId("invite-preview");
  await expect(card.getByTestId("workspace-slug")).toHaveText(E2E_COMPANY.slug);
  await expect(preview.getByTestId("invite-preview-name")).toHaveText(E2E_COMPANY.name);
  await expect(preview.getByTestId("brand-monogram")).toHaveText("EA");
  await expect(card.getByRole("button", { name: "Save changes" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  // The preview follows each edit before anything is saved.
  await card.getByLabel("Workspace name").fill("Northwind Studio");
  await expect(preview.getByTestId("invite-preview-name")).toHaveText("Northwind Studio");
  await expect(preview.getByTestId("brand-monogram")).toHaveText("NS");

  const color = card.getByLabel("Brand color", { exact: true });
  await color.fill("#e1fd73");
  await color.blur();
  await expect(
    card.getByText("That color is too light to stand out on white and light gray."),
  ).toBeVisible();
  await expect(color).toHaveAttribute("aria-invalid", "true");
  await expect(card.getByTestId("brand-contrast")).toContainText("On white: 1.1:1");

  await color.fill("#E03B9D");
  await expect(color).not.toHaveAttribute("aria-invalid");
  await expect(card.getByTestId("brand-contrast")).toContainText("On white: 4.0:1");
  await expect(preview.getByTestId("brand-monogram")).toHaveCSS(
    "background-color",
    "rgb(224, 59, 157)",
  );

  await card.getByLabel("Email sender name").fill("Northwind  Team");
  await expect(preview.getByTestId("invite-preview-sender")).toHaveText(
    "Northwind Team via Squint",
  );

  await card.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("workspace-saved")).toHaveText("Workspace saved.");
  await expect(color).toHaveValue("#e03b9d");

  await page.reload();
  const saved = page.getByTestId("workspace-brand-settings");
  await expect(saved.getByLabel("Workspace name")).toHaveValue("Northwind Studio");
  await expect(saved.getByLabel("Brand color", { exact: true })).toHaveValue("#e03b9d");
  await expect(saved.getByLabel("Email sender name")).toHaveValue("Northwind Team");
});

test("a guest sees the monogram, then the uploaded logo, then the monogram again once it's removed", async ({
  page,
  baseURL,
}) => {
  const { token } = await shareWorkspaceProject(page, PROJECT);
  const { guest, close } = await openAsGuest(page, baseURL, token);
  const brand = guest.getByTestId("guest-brand");
  await expect(brand.getByTestId("brand-monogram")).toHaveText("EA");
  await expect(brand.getByTestId("brand-logo")).toHaveCount(0);

  await page.goto("/account/workspace");
  const logoCard = page.getByTestId("workspace-logo-settings");
  await expect(logoCard.getByTestId("logo-fallback")).toBeVisible();
  // Wider than 512 px: the browser scales it down, keeping it whole, and stores a PNG.
  await logoCard.getByTestId("logo-input").setInputFiles(png(800, 400));
  await expect(page.getByTestId("logo-saved")).toHaveText("Logo saved.");
  const tile = logoCard.getByTestId("logo-image").locator("img");
  expect(await naturalSize(tile)).toEqual([512, 256]);
  await expectLightBacking(tile);
  expect(await logoRow()).toMatchObject({ contentType: "image/png" });
  // The preview shows the new logo at once.
  const previewLogo = page.getByTestId("invite-preview").getByTestId("brand-logo");
  await expect(previewLogo).toBeVisible();
  await expectLightBacking(previewLogo);

  await guest.reload();
  const logo = brand.getByTestId("brand-logo");
  await expect(logo).toBeVisible();
  expect(await naturalSize(logo)).toEqual([512, 256]);
  await expectLightBacking(logo);
  await expect(brand.getByTestId("brand-monogram")).toHaveCount(0);

  await logoCard.getByRole("button", { name: "Remove logo" }).click();
  await expect(page.getByTestId("logo-saved")).toHaveText("Logo removed.");
  await expect(logoCard.getByTestId("logo-fallback")).toBeVisible();
  expect(await logoRow()).toBeNull();
  await guest.reload();
  await expect(brand.getByTestId("brand-monogram")).toHaveText("EA");
  await expect(brand.getByTestId("brand-logo")).toHaveCount(0);
  await close();
});

test("a logo that's too wide is refused in the browser, before anything uploads", async ({
  page,
}) => {
  await page.goto("/account/workspace");
  const logoCard = page.getByTestId("workspace-logo-settings");
  await logoCard.getByTestId("logo-input").setInputFiles(png(1000, 100));
  await expect(page.getByTestId("logo-error")).toContainText("no more than 4 times as wide");
  await expect(logoCard.getByTestId("logo-fallback")).toBeVisible();
  expect(await logoRow()).toBeNull();
});

test("a photo is cropped square, resized, and shown with the account in the sidebar", async ({
  page,
}) => {
  await page.goto("/account/profile");
  const sidebar = page.getByRole("complementary", { name: "Workspace" });
  await expect(sidebar.getByTestId("account-avatar")).toHaveCount(0);
  const card = page.getByTestId("avatar-settings");
  await expect(card.getByTestId("avatar-fallback")).toBeVisible();

  await card.getByTestId("avatar-input").setInputFiles(png(900, 600));
  await expect(page.getByTestId("avatar-saved")).toHaveText("Photo saved.");
  expect(await naturalSize(card.getByTestId("avatar-image").locator("img"))).toEqual([512, 512]);
  const avatar = sidebar.getByTestId("account-avatar");
  await expect(avatar).toBeVisible();
  expect(await naturalSize(avatar)).toEqual([512, 512]);

  await card.getByRole("button", { name: "Remove photo" }).click();
  await expect(page.getByTestId("avatar-saved")).toHaveText("Photo removed.");
  await expect(sidebar.getByTestId("account-avatar")).toHaveCount(0);
});
