import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import {
  createImageProject,
  createUrlProject,
  mockCapture,
  mockFrameCheck,
  onlyCommentCard,
  openFolder,
  postComment,
  showComments,
} from "./squint-fixtures";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
const HOSTILE = "# Not a heading\n```\n[x](javascript:alert(1))";

/** Picks a format from the Export menu and returns the downloaded file's name and bytes. */
async function exportAs(page: Page, item: string): Promise<{ name: string; bytes: Buffer }> {
  await page.getByTestId("export-menu").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: item, exact: true }).click(),
  ]);
  const path = await download.path();
  return { name: download.suggestedFilename(), bytes: await readFile(path) };
}

function startsWithPng(bytes: Uint8Array | undefined): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes?.[index] === byte);
}

test("a website project exports its comments as ZIP, Markdown and JSON", async ({
  page,
  baseURL,
}) => {
  await mockFrameCheck(page, {
    verdict: "embeddable",
    finalUrl: `${baseURL}/sandbox`,
    status: 200,
  });
  await mockCapture(page);
  await openFolder(page);
  await createUrlProject(page, `${baseURL}/sandbox`, "Launch page");

  const trigger = page.getByTestId("export-menu");
  await expect(trigger).toBeDisabled();
  await expect(trigger).toHaveAccessibleDescription(/Add a comment first/);
  // Still focusable so the reason is announced, but it doesn't open.
  await trigger.click({ force: true });
  await expect(page.getByRole("menu")).toHaveCount(0);

  await page.getByTestId("mode-comment").click();
  await expect(page.getByRole("img", { name: /^Snapshot of/ })).toBeVisible();
  await postComment(page, HOSTILE, { x: 140, y: 120 }, "Ana");
  await showComments(page);
  // The crop is saved just after posting; export once it's there.
  await expect(onlyCommentCard(page).getByTestId("comment-crop").locator("img")).toBeVisible();
  await expect(trigger).toBeEnabled();

  const date = /-comments-\d{4}-\d{2}-\d{2}/;
  const zip = await exportAs(page, "ZIP (Markdown + JSON + screenshots)");
  expect(zip.name).toMatch(new RegExp(`^launch-page${date.source}\\.zip$`));
  const files = unzipSync(new Uint8Array(zip.bytes));
  const names = Object.keys(files).sort();
  const screenshot = names.find((name) => /^screenshots\/01-[a-z\d]{8}\.png$/.test(name));
  expect(screenshot).toBeDefined();
  expect(names).toEqual(
    expect.arrayContaining([
      "comments.md",
      "comments.json",
      expect.stringMatching(/^snapshots\/.+\.png$/),
    ]),
  );
  expect(startsWithPng(screenshot ? files[screenshot] : undefined)).toBe(true);

  const markdown = strFromU8(files["comments.md"] ?? new Uint8Array());
  expect(markdown).toContain("# Squint review: Launch page");
  expect(markdown).toContain("## Active comments (1)");
  expect(markdown).toContain(`![Screenshot for comment 1](${screenshot})`);
  expect(markdown).toContain("````text\n# Not a heading\n```\n[x](javascript:alert(1))\n````");

  const json = JSON.parse(strFromU8(files["comments.json"] ?? new Uint8Array())) as {
    schema: string;
    filesIncluded: boolean;
    comments: Array<{ number: number; body: string; author: string; screenshot: { file: string } }>;
  };
  expect(json).toMatchObject({ schema: "squint.comments/1", filesIncluded: true });
  expect(json.comments).toEqual([
    expect.objectContaining({
      number: 1,
      author: "Ana",
      body: HOSTILE,
      screenshot: expect.objectContaining({ file: screenshot }),
    }),
  ]);

  const bare = await exportAs(page, "Markdown");
  expect(bare.name).toMatch(new RegExp(`^launch-page${date.source}\\.md$`));
  const bareText = bare.bytes.toString("utf8");
  expect(bareText).not.toContain("![");
  expect(bareText).toContain("Download the ZIP export from Squint to get them.");

  const bareJson = await exportAs(page, "JSON");
  expect(bareJson.name).toMatch(new RegExp(`^launch-page${date.source}\\.json$`));
  expect(JSON.parse(bareJson.bytes.toString("utf8"))).toMatchObject({
    schema: "squint.comments/1",
    filesIncluded: false,
    counts: { active: 1, resolved: 0 },
  });
  // The ZIP and Markdown toasts may still be fading out, so pick this one by its file name.
  await expect(
    page.getByTestId("toast").filter({ hasText: `Downloaded ${bareJson.name}` }),
  ).toBeVisible();
});

test("an image project's ZIP carries the image and each comment's screenshot", async ({ page }) => {
  await openFolder(page);
  await createImageProject(page, "checkout.png");
  await postComment(page, "Bigger button.", { x: 100, y: 80 }, "Leo");
  await showComments(page);
  await expect(onlyCommentCard(page).getByTestId("comment-crop").locator("img")).toBeVisible();

  const zip = await exportAs(page, "ZIP (Markdown + JSON + screenshots)");
  const files = unzipSync(new Uint8Array(zip.bytes));
  const names = Object.keys(files);
  expect(names).toEqual(expect.arrayContaining(["comments.md", "comments.json"]));
  expect(names.some((name) => /^source-image\.(webp|jpg)$/.test(name))).toBe(true);
  expect(names.some((name) => /^screenshots\/01-.+\.png$/.test(name))).toBe(true);
  const markdown = strFromU8(files["comments.md"] ?? new Uint8Array());
  expect(markdown).toContain("- **Source:** image `checkout.png` (");
  expect(markdown).toMatch(/x \d+ px, y \d+ px on a \d+ × \d+ px image/);
});
