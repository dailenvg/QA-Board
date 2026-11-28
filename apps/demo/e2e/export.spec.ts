import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, test } from "./test";
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

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const HOSTILE = "# Not a heading\n```\n[x](javascript:alert(1))";

/**
 * Picks a format from the Export menu and returns the downloaded file's name and bytes: by name
 * from the team's group, or a client's item by its test id.
 */
async function exportAs(
  page: Page,
  item: string | { testId: string },
): Promise<{ name: string; bytes: Buffer }> {
  await page.getByTestId("export-menu").click();
  const menuItem =
    typeof item === "string"
      ? page.getByRole("group", { name: "For your team" }).getByRole("menuitem", {
          name: item,
          exact: true,
        })
      : page.getByTestId(item.testId);
  const [download] = await Promise.all([page.waitForEvent("download"), menuItem.click()]);
  const path = await download.path();
  return { name: download.suggestedFilename(), bytes: await readFile(path) };
}

function startsWithJpeg(bytes: Uint8Array | undefined): boolean {
  return JPEG_SIGNATURE.every((byte, index) => bytes?.[index] === byte);
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
  const screenshot = names.find((name) => /^screenshots\/01-[a-z\d]{8}\.jpg$/.test(name));
  expect(screenshot).toBeDefined();
  expect(names).toEqual(
    expect.arrayContaining([
      "comments.md",
      "comments.json",
      expect.stringMatching(/^snapshots\/.+\.png$/),
    ]),
  );
  expect(startsWithJpeg(screenshot ? files[screenshot] : undefined)).toBe(true);

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
  expect(json).toMatchObject({ schema: "squint.comments/3", filesIncluded: true });
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
    schema: "squint.comments/3",
    filesIncluded: false,
    counts: { active: 1, resolved: 0 },
  });
  // The ZIP and Markdown toasts may still be fading out, so pick this one by its file name.
  await expect(
    page.getByTestId("toast").filter({ hasText: `Downloaded ${bareJson.name}` }),
  ).toBeVisible();
});

test("an image project's ZIP carries its page and each comment's screenshot", async ({ page }) => {
  await openFolder(page);
  await createImageProject(page, "checkout.png");
  await postComment(page, "Bigger button.", { x: 100, y: 80 }, "Leo");
  await showComments(page);
  await expect(onlyCommentCard(page).getByTestId("comment-crop").locator("img")).toBeVisible();

  const zip = await exportAs(page, "ZIP (Markdown + JSON + screenshots)");
  const files = unzipSync(new Uint8Array(zip.bytes));
  const names = Object.keys(files);
  expect(names).toEqual(expect.arrayContaining(["comments.md", "comments.json"]));
  expect(names.some((name) => /^pages\/01\.(webp|jpg)$/.test(name))).toBe(true);
  expect(names.some((name) => /^screenshots\/01-p01-.+\.jpg$/.test(name))).toBe(true);
  const markdown = strFromU8(files["comments.md"] ?? new Uint8Array());
  expect(markdown).toContain("- **Source:** image `checkout.png` (");
  expect(markdown).toMatch(/of page 1 = x \d+ px, y \d+ px on a \d+ × \d+ px image/);
  expect(markdown).toContain("- **Page:** 1 of 1, `checkout.png`; image [pages/01.");
  const json = JSON.parse(strFromU8(files["comments.json"] ?? new Uint8Array())) as {
    comments: Array<{ location: { surface: string; page: { number: number; name: string } } }>;
  };
  expect(json.comments[0]?.location).toMatchObject({
    surface: "page",
    page: { number: 1, name: "checkout.png" },
  });
});

test("an export for the client leaves team-only comments out; the team's marks them", async ({
  page,
}) => {
  await openFolder(page);
  await createImageProject(page, "audiences.png");
  await postComment(page, "For the client", { x: 100, y: 80 }, "Leo");
  await postComment(page, "Internal note", { x: 220, y: 140 });
  await showComments(page);
  // Without a review link, making it team only asks nothing (D11).
  const internal = page.getByTestId("comment-card").filter({ hasText: "Internal note" });
  await internal.getByRole("button", { name: "Actions for comment 2" }).click();
  await page.getByRole("menuitem", { name: "Make team only" }).click();
  await expect(internal.getByTestId("team-only-chip")).toBeVisible();

  const team = await exportAs(page, "Markdown");
  expect(team.name).toMatch(/^audiences-comments-\d{4}-\d{2}-\d{2}\.md$/);
  const teamText = team.bytes.toString("utf8");
  expect(teamText).toContain("### Comment T1 · Team only");
  expect(teamText).toContain("Internal note");

  const client = await exportAs(page, { testId: "export-client-markdown" });
  expect(client.name).toMatch(/^audiences-comments-for-client-\d{4}-\d{2}-\d{2}\.md$/);
  const clientText = client.bytes.toString("utf8");
  expect(clientText).toContain("### Comment 1");
  expect(clientText).toContain("For the client");
  expect(clientText).not.toContain("Internal note");
  expect(clientText).not.toContain("Team only");
});
