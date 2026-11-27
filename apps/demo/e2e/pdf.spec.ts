import { createRequire } from "node:module";
import type { Page } from "@playwright/test";
import { expect, test } from "./test";
import { samplePdf } from "./pdf-fixture";
import { newProjectButton, openFolder, postComment, samplePngFiles } from "./squint-fixtures";

/** The installed pdf.js version, which names the folder its data is served from. */
const { version } = createRequire(import.meta.url)("pdfjs-dist/package.json") as {
  version: string;
};

/** Opens the New project dialog in PDF mode. */
async function pdfMode(page: Page) {
  await newProjectButton(page).click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await dialog.getByRole("radio", { name: "PDF" }).click();
  return dialog;
}

test("a PDF becomes a project with a page per PDF page, rendered without leaving the app", async ({
  page,
  baseURL,
}) => {
  await openFolder(page);
  const dialog = await pdfMode(page);
  // Every progress message, as it's shown (rendering a tiny PDF is quick).
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as Window & { __pdfProgress?: string[] }).__pdfProgress = seen;
    new MutationObserver(() => {
      const text = document.querySelector('[data-testid="pdf-progress"]')?.textContent;
      if (text && seen.at(-1) !== text) seen.push(text);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  await dialog.getByTestId("pdf-input").setInputFiles({
    name: "deck.pdf",
    mimeType: "application/pdf",
    buffer: samplePdf(["One", "Two", "Three"], { cjk: true }),
  });
  await expect(dialog.getByTestId("pdf-ready")).toContainText("deck.pdf");
  await expect(dialog.getByTestId("pdf-ready")).toContainText("3 pages, ready");
  const progress = await page.evaluate(
    () => (window as Window & { __pdfProgress?: string[] }).__pdfProgress ?? [],
  );
  expect(progress).toEqual([
    "Rendering page 1 of 3",
    "Rendering page 2 of 3",
    "Rendering page 3 of 3",
  ]);
  // pdf.js and its worker come from this app; nothing is fetched from anywhere else.
  // (A `blob:` URL's origin is the page's own: the first page's preview.)
  const origin = new URL(baseURL ?? "").origin;
  expect(requests.filter((url) => new URL(url).origin !== origin)).toEqual([]);
  expect(requests.some((url) => /pdf\.worker\.min\.[\w-]+\.mjs$/.test(url))).toBe(true);
  // The CJK text's CMap came from the app's own copy of pdf.js's data.
  expect(requests.some((url) => /\/pdfjs\/[\d.]+\/cmaps\/UniGB-UCS2-H\.bcmap$/.test(url))).toBe(
    true,
  );
  await expect(dialog.getByLabel("Project name (optional)")).toHaveAttribute("placeholder", "deck");
  await expect(dialog.getByTestId("create-project")).toHaveText("Create project with 3 pages");
  await dialog.getByTestId("create-project").click();

  await expect(page.getByRole("heading", { level: 1, name: "deck" })).toBeVisible();
  await expect(page.getByTestId("page-position")).toHaveText("Page 1 of 3");
  await page.getByRole("button", { name: "Page 3", exact: true }).click();
  await expect(page.getByTestId("page-position")).toHaveText("Page 3 of 3");
  await postComment(page, "Fix the last slide.", { x: 120, y: 90 }, "Ana");

  await page.getByTestId("export-menu").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Markdown", exact: true }).click(),
  ]);
  const markdown = await download.createReadStream().then(async (stream) => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks).toString("utf8");
  });
  expect(markdown).toContain("- **Source:** PDF `deck.pdf`, 3 pages");
  expect(markdown).toContain("- **Page:** 3 of 3; image `pages/03.");
  expect(markdown).toMatch(/of page 3 = x \d+ px, y \d+ px on a \d+ × \d+ px page/);
});

test("a damaged PDF, or a file that isn't one, says so and adds nothing", async ({ page }) => {
  await openFolder(page);
  const dialog = await pdfMode(page);
  const input = dialog.getByTestId("pdf-input");

  await input.setInputFiles({
    name: "notes.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("Just some text, not a PDF."),
  });
  await expect(dialog.getByRole("alert")).toHaveText("That file isn't a PDF. Choose a PDF file.");

  await input.setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(4096, 0x7f)]),
  });
  await expect(dialog.getByRole("alert")).toHaveText(
    "That PDF couldn't be read. It may be damaged. Try exporting it again.",
  );
  await dialog.getByTestId("create-project").click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("That PDF couldn't be read.");
});

test("a PDF over 50 pages offers its first 50, and Stop rendering stops it", async ({ page }) => {
  await openFolder(page);
  const dialog = await pdfMode(page);
  const labels = Array.from({ length: 51 }, (_, index) => `Slide ${index + 1}`);
  await dialog.getByTestId("pdf-input").setInputFiles({
    name: "long.pdf",
    mimeType: "application/pdf",
    buffer: samplePdf(labels),
  });
  const choice = dialog.getByRole("alert");
  await expect(choice).toContainText("long.pdf has 51 pages. A project holds up to 50.");
  await choice.getByRole("button", { name: "Use the first 50 pages" }).click();
  await expect(dialog.getByTestId("pdf-progress")).toContainText(/Rendering page \d+ of 50/);
  await dialog.getByRole("button", { name: "Stop rendering" }).click();
  await expect(dialog.getByTestId("pdf-progress")).toHaveCount(0);
  await expect(dialog.getByTestId("pdf-dropzone")).toContainText("Drop a PDF here");
  await dialog.getByTestId("create-project").click();
  await expect(dialog.getByRole("alert")).toHaveText("Choose a PDF.");
});

test("a rendered PDF stays in PDF mode: Image mode creates an image project", async ({ page }) => {
  await openFolder(page);
  const dialog = await pdfMode(page);
  await dialog.getByTestId("pdf-input").setInputFiles({
    name: "deck.pdf",
    mimeType: "application/pdf",
    buffer: samplePdf(["One", "Two"]),
  });
  await expect(dialog.getByTestId("pdf-ready")).toContainText("2 pages, ready");

  await dialog.getByRole("radio", { name: "Image" }).click();
  const [photo] = await samplePngFiles(page, ["Photo"]);
  if (!photo) throw new Error("no image");
  await dialog.getByTestId("image-input").setInputFiles(photo);
  await expect(dialog.locator('[data-testid="picked-image"][data-status="ready"]')).toHaveCount(1);
  await expect(dialog.getByLabel("Project name (optional)")).toHaveAttribute(
    "placeholder",
    "photo",
  );
  await dialog.getByTestId("create-project").click();

  await expect(page.getByRole("heading", { level: 1, name: "photo" })).toBeVisible();
  await expect(page.getByTestId("page-strip")).toHaveCount(0);
});

test("pdf.js's data is served by the app, without its scripting sandbox", async ({ request }) => {
  const decoder = await request.get(`/pdfjs/${version}/wasm/openjpeg.wasm`);
  expect(decoder.status()).toBe(200);
  expect(decoder.headers()["content-type"]).toBe("application/wasm");
  for (const path of ["standard_fonts/FoxitSerif.pfb", "iccs/CGATS001Compat-v2-micro.icc"]) {
    expect((await request.get(`/pdfjs/${version}/${path}`)).status()).toBe(200);
  }
  expect((await request.get(`/pdfjs/${version}/wasm/quickjs-eval.wasm`)).status()).toBe(404);
});

/** The middle of the stage on screen, where the zoom keys and buttons zoom around. */
async function stageCentre(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId("canvas-area").boundingBox();
  if (!box) throw new Error("no stage");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Where `point` falls on the page's surface, as percentages of its width and height. */
async function surfaceSpot(page: Page, point: { x: number; y: number }) {
  const box = await page.locator('main [data-testid="canvas"]').boundingBox();
  if (!box) throw new Error("no surface");
  return { x: ((point.x - box.x) / box.width) * 100, y: ((point.y - box.y) / box.height) * 100 };
}

/** Clicks `point` in Comment mode and reads the new pin's position, then closes the composer. */
async function pinAt(page: Page, point: { x: number; y: number }) {
  await page.mouse.click(point.x, point.y);
  const pin = page.getByTestId("draft-pin");
  await expect(pin).toHaveCount(1);
  const spot = await pin.evaluate((node: HTMLElement) => ({
    x: Number.parseFloat(node.style.left),
    y: Number.parseFloat(node.style.top),
  }));
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("composer")).toHaveCount(0);
  return spot;
}

test("zooming a PDF page keeps the point under it, pins land on the same spot, and Space-drag moves around", async ({
  page,
}) => {
  await openFolder(page);
  const dialog = await pdfMode(page);
  await dialog.getByTestId("pdf-input").setInputFiles({
    name: "zoom.pdf",
    mimeType: "application/pdf",
    buffer: samplePdf(["Zoom"]),
  });
  await expect(dialog.getByTestId("pdf-ready")).toContainText("1 page, ready");
  await dialog.getByTestId("create-project").click();
  const image = page.getByRole("img", { name: /the image under review/ });
  await expect(image).toBeVisible();
  const surface = page.locator('main [data-testid="canvas"]');
  const stage = page.getByTestId("canvas-area");
  await expect(page.getByTestId("zoom-level")).toHaveText("Fit");

  await page.getByTestId("mode-comment").click();
  const centre = await stageCentre(page);
  const atFit = await pinAt(page, centre);
  const spotAtFit = await surfaceSpot(page, centre);

  // 200% from the level menu: the page is twice its own width, and the spot in the middle of
  // the stage stays there.
  await page.getByTestId("zoom-level").click();
  await page.getByTestId("zoom-200").click();
  // The menu fades out over the stage: point at the stage once it's gone.
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.getByTestId("zoom-level")).toHaveText("200%");
  const natural = await image.evaluate((node: HTMLImageElement) => node.naturalWidth);
  await expect.poll(async () => (await surface.boundingBox())?.width).toBeCloseTo(natural * 2, 0);
  const spotZoomed = await surfaceSpot(page, centre);
  expect(spotZoomed.x).toBeCloseTo(spotAtFit.x, 0);
  expect(spotZoomed.y).toBeCloseTo(spotAtFit.y, 0);

  // A pin dropped there now lands on the same spot of the page as at Fit.
  const zoomed = await pinAt(page, centre);
  expect(Math.abs(zoomed.x - atFit.x)).toBeLessThan(0.5);
  expect(Math.abs(zoomed.y - atFit.y)).toBeLessThan(0.5);

  // Ctrl+wheel (a trackpad's pinch) zooms around the pointer, which stays on its spot.
  const pointer = { x: centre.x + 80, y: centre.y - 60 };
  await page.mouse.move(pointer.x, pointer.y);
  const beforeWheel = await surfaceSpot(page, pointer);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect(page.getByTestId("zoom-level")).not.toHaveText("200%");
  const afterWheel = await surfaceSpot(page, pointer);
  expect(afterWheel.x).toBeCloseTo(beforeWheel.x, 0);
  expect(afterWheel.y).toBeCloseTo(beforeWheel.y, 0);

  // Holding Space over the page and dragging scrolls the stage, and drops no pin.
  await page.keyboard.press("1");
  await expect(page.getByTestId("zoom-level")).toHaveText("100%");
  await page.getByTestId("zoom-level").click();
  await page.getByTestId("zoom-400").click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.getByTestId("zoom-in")).toHaveAttribute("aria-disabled", "true");
  await page.mouse.move(centre.x, centre.y);
  const start = await stage.evaluate((node) => ({ left: node.scrollLeft, top: node.scrollTop }));
  await page.keyboard.down("Space");
  await expect(page.getByTestId("comment-overlay")).toHaveCSS("cursor", "grab");
  await page.mouse.down();
  await page.mouse.move(centre.x - 150, centre.y - 100, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  const end = await stage.evaluate((node) => ({ left: node.scrollLeft, top: node.scrollTop }));
  expect(end.left - start.left).toBeCloseTo(150, -1);
  expect(end.top - start.top).toBeCloseTo(100, -1);
  await expect(page.getByTestId("draft-pin")).toHaveCount(0);
  await expect(page.getByTestId("composer")).toHaveCount(0);

  // 0 goes back to Fit, measured again: Zoom in works from it. (Zoom out may not: on a phone
  // the page fits below 25%.)
  await page.keyboard.press("0");
  await expect(page.getByTestId("zoom-level")).toHaveText("Fit");
  await expect(page.getByTestId("zoom-in")).not.toHaveAttribute("aria-disabled", "true");
});
