import { expect, test } from "@playwright/test";
import {
  createImageProject,
  createUrlProject,
  dropPin,
  mockCapture,
  mockFrameCheck,
  onlyCommentCard,
  OVERVIEW_HEADLINE,
  openFolder,
  postComment,
  samplePng,
  showComments,
  topBarStatus,
} from "./squint-fixtures";

test("a website project takes a comment from posted to resolved, reopened and deleted", async ({
  page,
  baseURL,
}) => {
  await mockFrameCheck(page, {
    verdict: "embeddable",
    finalUrl: `${baseURL}/sandbox`,
    status: 200,
  });
  // Comment mode on a website pins to a snapshot of it.
  await mockCapture(page);
  await openFolder(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My projects");

  await page.getByTestId("new-folder").click();
  const folderDialog = page.getByRole("dialog", { name: "New folder" });
  await folderDialog.getByLabel("Folder name").fill("Client work");
  await folderDialog.getByRole("button", { name: "Create folder" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Client work");
  await expect(page.getByRole("link", { name: /Client work/ })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await createUrlProject(page, `${baseURL}/sandbox`, "Sandbox review");
  await expect(
    page.getByRole("heading", { level: 1, name: "Sandbox review", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("preview-frame")).toBeVisible();
  await expect(topBarStatus(page)).toHaveAttribute("data-status", "ready");

  // C lands keyboard focus on the comment canvas; the framed site leaves the tab order.
  await expect(page.getByTestId("mode-comment")).not.toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("c");
  await expect(page.getByTestId("comment-overlay")).toBeFocused();
  await expect(page.getByTestId("preview-frame")).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("comment-overlay")).toHaveCount(0);
  await expect(page.getByTestId("preview-frame")).not.toHaveAttribute("tabindex", "-1");

  const composer = await dropPin(page);
  await composer.getByLabel("Your name").fill("Ana");
  await composer.getByLabel("Comment", { exact: true }).fill("Tighten the hero copy.");
  await composer.getByLabel("Comment", { exact: true }).press("Enter");
  await expect(composer).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Comment 1 by Ana", exact: true })).toBeVisible();
  await expect(topBarStatus(page)).toHaveAttribute("data-status", "comments");

  await showComments(page);
  const card = onlyCommentCard(page);
  await expect(card).toContainText("Tighten the hero copy.");

  await card.getByRole("button", { name: "Edit comment 1" }).click();
  await card.getByLabel("Edit comment").fill("Tighten the hero copy and shorten the title.");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card).toContainText("shorten the title");
  await expect(card).toContainText("Edited");

  await card.getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByTestId("toast")).toContainText("Comment resolved");
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId("comments-empty")).toContainText("All caught up");
  await expect(page.getByTestId("pin")).toHaveCount(0);
  await expect(page.getByTestId("tab-resolved")).toHaveText("Resolved 1");
  await expect(topBarStatus(page)).toHaveAttribute("data-status", "resolved");

  await page.getByTestId("tab-resolved").click();
  await expect(card).toContainText("shorten the title");
  await expect(
    page.getByRole("button", { name: "Comment 1 by Ana, resolved", exact: true }),
  ).toHaveAttribute("data-status", "resolved");

  await card.getByRole("button", { name: "Reopen" }).click();
  await expect(card).toHaveCount(0);
  await expect(topBarStatus(page)).toHaveAttribute("data-status", "comments");
  await page.getByTestId("tab-active").click();
  await expect(card).toContainText("shorten the title");

  await card.getByRole("button", { name: "Delete comment 1" }).click();
  await page
    .getByRole("dialog", { name: "Delete comment 1?" })
    .getByRole("button", { name: "Delete comment" })
    .click();
  await expect(page.getByTestId("comment-card")).toHaveCount(0);
  await expect(page.getByTestId("comments-empty")).toContainText("No comments yet");
  await expect(topBarStatus(page)).toHaveAttribute("data-status", "ready");

  await page.getByRole("link", { name: "Back to Client work" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Client work");
  const projectCard = page.getByTestId("project-card").filter({ hasText: "Sandbox review" });
  await expect(projectCard.getByTestId("status-chip")).toHaveAttribute("data-status", "ready");
});

test("an image project accepts a keyboard-placed pin and shows Comments in on the dashboard", async ({
  page,
}) => {
  await openFolder(page);
  const png = await samplePng(page);

  await page.getByTestId("new-project").click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await dialog.getByRole("radio", { name: "Image" }).click();
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "checkout-mockup.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(dialog.getByText("checkout-mockup.png")).toBeVisible();
  await expect(dialog.getByLabel("Project name")).toHaveValue("");
  await expect(dialog.getByLabel("Project name")).toHaveAttribute("placeholder", "checkout-mockup");
  await dialog.getByTestId("create-project").click();

  await expect(
    page.getByRole("img", { name: /checkout-mockup, the image under review/ }),
  ).toBeVisible();
  await page.getByTestId("mode-comment").click();
  await expect(page.getByTestId("comment-overlay")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Enter");

  const composer = page.getByTestId("composer");
  await composer.getByLabel("Your name").fill("Leo");
  await composer.getByLabel("Comment", { exact: true }).fill("Bigger checkout button.");
  await composer.getByRole("button", { name: "Post" }).click();
  await expect(page.getByRole("button", { name: "Comment 1 by Leo", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Back to My projects" }).click();
  const projectCard = page.getByTestId("project-card").filter({ hasText: "checkout-mockup" });
  await expect(projectCard.getByTestId("status-chip")).toHaveAttribute("data-status", "comments");

  await page.getByRole("radio", { name: "Comments in" }).click();
  await expect(page.getByTestId("project-card")).toHaveCount(1);
  await page.getByRole("radio", { name: "Ready to review" }).click();
  await expect(page.getByTestId("dashboard-empty")).toBeVisible();
});

test("a site that refuses framing offers a screenshot instead", async ({ page }) => {
  await mockFrameCheck(page, {
    verdict: "blocked",
    reason: "x-frame-options",
    finalUrl: "https://blocked.example/",
  });
  await openFolder(page);
  await createUrlProject(page, "blocked.example", "Blocked site");

  const fallback = page.getByTestId("frame-fallback");
  await expect(fallback).toContainText("This site can't be shown here");
  await expect(fallback.getByRole("link", { name: /Open site in new tab/ })).toHaveAttribute(
    "href",
    "https://blocked.example/",
  );

  await fallback.getByTestId("screenshot-input").setInputFiles({
    name: "blocked-home.png",
    mimeType: "image/png",
    buffer: await samplePng(page, "Screenshot"),
  });
  await expect(
    page.getByRole("img", { name: /Blocked site, the image under review/ }),
  ).toBeVisible();
  await expect(fallback).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Open the original site/ })).toHaveAttribute(
    "href",
    "https://blocked.example/",
  );
});

test("an unknown project id shows a way back", async ({ page }) => {
  await page.goto("/p/does-not-exist");
  await expect(page.getByTestId("project-not-found")).toBeVisible();
  await page.getByRole("link", { name: "Back to Overview" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(OVERVIEW_HEADLINE.empty);
});

test("unreadable saved data can be reset without crashing", async ({ page }) => {
  await page.goto("/sandbox");
  await page.evaluate(() => localStorage.setItem("squint:v1", "{not json"));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "We couldn't read your saved projects" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start fresh" }).click();
  await page
    .getByRole("dialog", { name: "Start fresh?" })
    .getByRole("button", { name: "Start fresh" })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(OVERVIEW_HEADLINE.empty);
});

test("a name typed after the address is kept exactly as typed", async ({ page }) => {
  await mockFrameCheck(page, {
    verdict: "blocked",
    reason: "csp",
    finalUrl: "https://acme.example/",
  });
  await openFolder(page);
  await page.getByTestId("new-project").click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await dialog.getByLabel("Website address").fill("acme.example");
  // A mouse user clicks straight into the name field and types.
  await dialog.getByLabel("Project name").click();
  await expect(dialog.getByLabel("Website address")).toHaveValue("https://acme.example/");
  await expect(dialog.getByLabel("Project name")).toHaveAttribute("placeholder", "acme.example");
  await dialog.getByLabel("Project name").pressSequentially("Homepage");
  await expect(dialog.getByLabel("Project name")).toHaveValue("Homepage");
  await dialog.getByTestId("create-project").click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Homepage", exact: true }),
  ).toBeVisible();
});

test("deleting a comment or a project can be undone", async ({ page }) => {
  await openFolder(page);
  await createImageProject(page, "undo-check.png");

  await postComment(page, "First note", { x: 100, y: 80 }, "Ana");
  await postComment(page, "Second note", { x: 220, y: 160 });
  await expect(page.getByRole("button", { name: "Comment 2 by Ana", exact: true })).toBeVisible();

  await showComments(page);
  const first = page.getByTestId("comment-card").filter({ hasText: "First note" });
  await first.getByRole("button", { name: "Resolve" }).click();
  await page.getByTestId("tab-resolved").click();
  await first.getByRole("button", { name: "Delete comment 1" }).click();
  await page
    .getByRole("dialog", { name: "Delete comment 1?" })
    .getByRole("button", { name: "Delete comment" })
    .click();
  await expect(first).toHaveCount(0);
  // With the first comment gone, the second one is numbered 1 for now.
  await expect(page.getByRole("button", { name: "Comment 1 by Ana", exact: true })).toBeVisible();

  // The previous toast is still fading out for a moment, so pick this one by its text.
  const toast = page.getByTestId("toast").filter({ hasText: "Comment deleted" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Undo" }).click();

  await expect(
    page.getByRole("button", { name: "Comment 1 by Ana, resolved", exact: true }),
  ).toHaveAttribute("data-status", "resolved");
  await expect(page.getByRole("button", { name: "Comment 2 by Ana", exact: true })).toBeVisible();
  await expect(first).toBeVisible();
  await expect(first.getByRole("button", { name: "Reopen" })).toBeVisible();
  await expect(page.getByTestId("tab-resolved")).toHaveText("Resolved 1");

  await page.getByRole("link", { name: "Back to My projects" }).click();
  const card = page.getByTestId("project-card").filter({ hasText: "undo-check" });
  await card.getByTestId("project-menu").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page
    .getByRole("dialog", { name: "Delete undo-check?" })
    .getByRole("button", { name: "Delete project" })
    .click();
  await expect(card).toHaveCount(0);
  const projectToast = page.getByTestId("toast").filter({ hasText: "Deleted undo-check" });
  await expect(projectToast).toBeVisible();
  await projectToast.getByRole("button", { name: "Undo" }).click();
  await expect(card.getByTestId("status-chip")).toHaveAttribute("data-status", "comments");
  await card.getByRole("link", { name: "undo-check" }).click();
  await expect(page.getByRole("button", { name: "Comment 2 by Ana", exact: true })).toBeVisible();
});
