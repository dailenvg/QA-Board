import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./test";
import { SIGNED_OUT } from "./auth-fixtures";
import { E2E_COMPANY } from "./e2e-env";
import { snapshotPng } from "./sample-snapshot";
import {
  mockFrameCheck,
  OVERVIEW_HEADLINE,
  openOverview,
  shareWorkspaceProject,
} from "./squint-fixtures";
import { brandWorkspace, logoRow } from "./workspace-db";

const PROJECT = "Spring launch";

/** A picked file, as the uploader's hidden input receives it. */
function png(width: number, height: number) {
  return { name: "picked.png", mimeType: "image/png", buffer: snapshotPng(width, height) };
}

/** Picks `file` with an uploader's hidden input, then saves the crop step as it opens. */
async function pickAndSave(page: Page, input: Locator, file: ReturnType<typeof png>) {
  await input.setInputFiles(file);
  const crop = page.getByTestId("image-crop");
  await expect(crop).toBeVisible();
  await crop.getByTestId("image-crop-save").click();
  await expect(crop).toBeHidden();
}

/** The crop step's preview image and its frame, laid out (transforms included). */
async function cropBoxes(page: Page) {
  const frame = page.getByTestId("image-crop-frame");
  const [image, outer] = await Promise.all([
    frame.locator("img").boundingBox(),
    frame.boundingBox(),
  ]);
  if (!image || !outer) throw new Error("the crop preview isn't laid out");
  return { image, frame: outer };
}

/** Presses `key` (Tab or Shift+Tab) until `target` has focus, a few times at most. */
async function tabTo(page: Page, target: Locator, key: "Tab" | "Shift+Tab") {
  for (let press = 0; press < 8; press += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press(key);
  }
  await expect(target).toBeFocused();
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

/**
 * A logo fills its frame, cropped rather than shrunk to fit, on a white
 * backing that shows through any transparent parts on dark surfaces.
 */
async function expectFills(image: Locator, frame: Locator) {
  await expect(image).toHaveCSS("object-fit", "cover");
  await expect(image.locator("..")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const [inner, outer] = await Promise.all([image.boundingBox(), frame.boundingBox()]);
  if (!inner || !outer) throw new Error("the logo or its frame isn't laid out");
  expect(inner.width).toBeCloseTo(outer.width, 0);
  expect(inner.height).toBeCloseTo(outer.height, 0);
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
  // Saved at Fit: the browser squares it, the logo whole on transparent padding, scaled to
  // 512 px, and stores a PNG.
  await pickAndSave(page, logoCard.getByTestId("logo-input"), png(800, 400));
  await expect(page.getByTestId("logo-saved")).toHaveText("Logo saved.");
  const tile = logoCard.getByTestId("logo-image");
  expect(await naturalSize(tile.locator("img"))).toEqual([512, 512]);
  await expectFills(tile.locator("img"), tile);
  expect(await logoRow()).toMatchObject({ contentType: "image/png" });
  // The preview shows the new logo at once.
  const preview = page.getByTestId("invite-preview");
  const previewLogo = preview.getByTestId("brand-logo");
  await expect(previewLogo).toBeVisible();
  await expectFills(previewLogo, preview.getByTestId("brand-mark"));

  await guest.reload();
  const logo = brand.getByTestId("brand-logo");
  await expect(logo).toBeVisible();
  expect(await naturalSize(logo)).toEqual([512, 512]);
  await expectFills(logo, brand.getByTestId("brand-mark"));
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

test("the Overview opens with the workspace's name and monogram, then its logo once it has one", async ({
  page,
}) => {
  await openOverview(page);
  const header = page.getByTestId("workspace-header");
  await expect(header.getByTestId("workspace-header-name")).toHaveText(E2E_COMPANY.name);
  const monogram = header.getByTestId("workspace-header-monogram");
  await expect(monogram).toHaveText("EA");
  await expect(monogram).toHaveCSS("background-color", "rgb(1, 45, 97)");
  await expect(header.getByTestId("workspace-header-logo")).toHaveCount(0);
  // The name is no heading: the page's one h1 stays the hero's.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(OVERVIEW_HEADLINE.empty);

  // Seeded the way an upload stores it (512 px square). The tests below cover the upload
  // itself, and seeding keeps their uploads inside the per-user limit (10 a minute) across
  // both projects.
  await brandWorkspace({ logo: snapshotPng(512, 512) });

  await openOverview(page);
  const logo = header.getByTestId("workspace-header-logo");
  await expect(logo).toBeVisible();
  // The members' logo route, at the logo's version: a new upload is a new URL.
  const src = new URL((await logo.getAttribute("src")) ?? "", page.url());
  expect(`${src.pathname}${src.search}`).toMatch(
    /^\/api\/account\/workspace\/logo\?v=[0-9a-f]{16}$/,
  );
  expect(await naturalSize(logo)).toEqual([512, 512]);
  await expectFills(logo, header.getByTestId("workspace-header-tile"));
  await expect(monogram).toHaveCount(0);
  await expect(header.getByTestId("workspace-header-name")).toHaveText(E2E_COMPANY.name);
});

test("a very wide logo opens the crop step and saves square", async ({ page }) => {
  await page.goto("/account/workspace");
  const logoCard = page.getByTestId("workspace-logo-settings");
  // 40:1, far past the server's 4:1: the crop step squares it, so the browser takes it.
  await logoCard.getByTestId("logo-input").setInputFiles(png(4000, 100));
  const crop = page.getByRole("dialog", { name: "Adjust logo" });
  const zoom = crop.getByRole("slider", { name: "Size" });
  await expect(zoom).toHaveAttribute("aria-valuetext", "Fit");
  await expect(page.getByTestId("logo-error")).toBeEmpty();
  // Fit: the whole strip across the frame's middle, padded as any logo is.
  await expect(async () => {
    const { image, frame } = await cropBoxes(page);
    expect(image.width).toBeCloseTo(frame.width * 0.7, 0);
    expect(image.y + image.height / 2).toBeCloseTo(frame.y + frame.height / 2, 0);
  }).toPass();
  // As close as it goes, the strip's height meets the frame: Fill is the slider's end.
  await zoom.press("End");
  await expect(zoom).toHaveAttribute("aria-valuetext", "Fill");
  await zoom.press("Home");
  await expect(zoom).toHaveAttribute("aria-valuetext", "Fit");

  await crop.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("logo-saved")).toHaveText("Logo saved.");
  expect(await naturalSize(logoCard.getByTestId("logo-image").locator("img"))).toEqual([512, 512]);
  expect(await logoRow()).toMatchObject({ contentType: "image/png" });
});

test("a photo is cropped square, resized, and shown with the account in the sidebar", async ({
  page,
}) => {
  await page.goto("/account/profile");
  const sidebar = page.getByRole("complementary", { name: "Workspace" });
  await expect(sidebar.getByTestId("account-avatar")).toHaveCount(0);
  // Without a photo, the user's initials: paper on navy, which reads in both themes.
  const initials = sidebar.getByTestId("account-initials");
  await expect(initials).toHaveText(/^\S{1,2}$/);
  await expect(initials).toHaveCSS("background-color", "rgb(1, 45, 97)");
  await expect(initials).toHaveCSS("color", "rgb(253, 253, 253)");
  const card = page.getByTestId("avatar-settings");
  await expect(card.getByTestId("avatar-fallback")).toBeVisible();

  // The crop step starts a photo at Fill, its least: the round avatar must be covered.
  await card.getByTestId("avatar-input").setInputFiles(png(900, 600));
  const crop = page.getByRole("dialog", { name: "Adjust photo" });
  await expect(crop.getByTestId("image-crop-zoom")).toHaveAttribute("aria-valuetext", "Fill");
  await expect(crop.getByRole("button", { name: "Smaller" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(async () => {
    const { image, frame } = await cropBoxes(page);
    expect(image.height).toBeCloseTo(frame.height, 0);
    expect(image.width).toBeCloseTo(frame.width * 1.5, 0);
  }).toPass();
  await crop.getByTestId("image-crop-save").click();
  await expect(page.getByTestId("avatar-saved")).toHaveText("Photo saved.");
  expect(await naturalSize(card.getByTestId("avatar-image").locator("img"))).toEqual([512, 512]);
  const avatar = sidebar.getByTestId("account-avatar");
  await expect(avatar).toBeVisible();
  expect(await naturalSize(avatar)).toEqual([512, 512]);
  await expect(initials).toHaveCount(0);

  await card.getByRole("button", { name: "Remove photo" }).click();
  await expect(page.getByTestId("avatar-saved")).toHaveText("Photo removed.");
  await expect(sidebar.getByTestId("account-avatar")).toHaveCount(0);
  await expect(initials).toBeVisible();
});

test("a logo opens the crop step at Fit, and saves square as it's sized and moved", async ({
  page,
}) => {
  await page.goto("/account/workspace");
  const logoCard = page.getByTestId("workspace-logo-settings");
  await logoCard.getByTestId("logo-input").setInputFiles(png(800, 400));
  const crop = page.getByRole("dialog", { name: "Adjust logo" });
  const zoom = crop.getByRole("slider", { name: "Size" });
  await expect(zoom).toHaveAttribute("aria-valuetext", "Fit");
  await expect(zoom).toBeFocused();
  // Fit: the whole logo, centred, with room around it (15% a side, so it clears a round frame).
  await expect(async () => {
    const { image, frame } = await cropBoxes(page);
    expect(image.width).toBeCloseTo(frame.width * 0.7, 0);
    expect(image.x - frame.x).toBeCloseTo(frame.width * 0.15, 0);
  }).toPass();

  // The + button stops at Fill on its way past: the shorter edge meets the frame.
  const larger = crop.getByRole("button", { name: "Larger" });
  for (let press = 0; press < 10; press += 1) {
    if ((await zoom.getAttribute("aria-valuetext")) === "Fill") break;
    await larger.click();
  }
  await expect(zoom).toHaveAttribute("aria-valuetext", "Fill");
  await expect(async () => {
    const { image, frame } = await cropBoxes(page);
    expect(image.height).toBeCloseTo(frame.height, 0);
  }).toPass();

  // Dragged left further than it can go, it stops with its right edge on the frame's.
  const { frame } = await cropBoxes(page);
  const middle = frame.y + frame.height / 2;
  await page.mouse.move(frame.x + frame.width * 0.9, middle);
  await page.mouse.down();
  await page.mouse.move(frame.x + frame.width * 0.1, middle, { steps: 8 });
  await page.mouse.up();
  await expect(async () => {
    const { image } = await cropBoxes(page);
    expect(image.x + image.width).toBeCloseTo(frame.x + frame.width, 0);
    expect(image.y).toBeCloseTo(frame.y, 0);
  }).toPass();

  await crop.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("logo-saved")).toHaveText("Logo saved.");
  // At Fill the frame covers 400 source pixels: stored at those, square.
  expect(await naturalSize(logoCard.getByTestId("logo-image").locator("img"))).toEqual([400, 400]);
  expect(await logoRow()).toMatchObject({ contentType: "image/png" });
});

test("Cancel in the crop step uploads nothing and goes back to the button", async ({ page }) => {
  await page.goto("/account/workspace");
  const logoCard = page.getByTestId("workspace-logo-settings");
  await logoCard.getByTestId("logo-input").setInputFiles(png(600, 600));
  const crop = page.getByTestId("image-crop");
  await expect(crop).toBeVisible();
  await crop.getByTestId("image-crop-cancel").click();
  await expect(crop).toBeHidden();
  await expect(logoCard.getByTestId("logo-pick")).toBeFocused();
  await expect(logoCard.getByTestId("logo-fallback")).toBeVisible();
  await expect(page.getByTestId("logo-saved")).toBeHidden();
  expect(await logoRow()).toBeNull();
});

test("the crop step works from the keyboard alone", async ({ page }) => {
  await page.goto("/account/workspace");
  const logoCard = page.getByTestId("workspace-logo-settings");
  const pick = logoCard.getByTestId("logo-pick");
  await pick.focus();
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (await chooser).setFiles(png(800, 400));

  const crop = page.getByRole("dialog", { name: "Adjust logo" });
  const zoom = crop.getByRole("slider", { name: "Size" });
  await expect(zoom).toBeFocused();
  // Measurements below compare positions: wait for the dialog's pop-in to settle first.
  await expect(crop).toHaveCSS("transform", "none");
  await page.keyboard.press("ArrowRight");
  await expect(zoom).toHaveAttribute("aria-valuetext", /^\d+%$/);
  await page.keyboard.press("End");
  await expect(crop.getByRole("button", { name: "Larger" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  // Back to the frame, where arrow keys move the image (Shift for a bigger step).
  const frame = crop.getByTestId("image-crop-frame");
  await tabTo(page, frame, "Shift+Tab");
  const before = await cropBoxes(page);
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(async () => {
    const { image } = await cropBoxes(page);
    expect(image.x - before.image.x).toBeCloseTo(-before.frame.width * 0.1, 0);
  }).toPass();

  await tabTo(page, crop.getByRole("button", { name: "Save" }), "Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("logo-saved")).toHaveText("Logo saved.");
  await expect(pick).toBeFocused();
  // Zoomed all the way in, the frame covers 128 source pixels: stored at those.
  expect(await naturalSize(logoCard.getByTestId("logo-image").locator("img"))).toEqual([128, 128]);
});
