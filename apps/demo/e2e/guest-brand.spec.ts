import type { Page } from "@playwright/test";
import { expect, test } from "./test";
import { SIGNED_OUT } from "./auth-fixtures";
import { E2E_ADMIN, E2E_COMPANY } from "./e2e-env";
import { snapshotPng } from "./sample-snapshot";
import { mockFrameCheck, shareWorkspaceProject } from "./squint-fixtures";
import { brandWorkspace, e2eWorkspaceId, userIds } from "./workspace-db";

const PROJECT = "Spring launch";
const COLOR = "#e03b9d";

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
  return { guest, close: () => context.close() };
}

test("a guest sees the company that shared the link, with its logo once it has one", async ({
  page,
  baseURL,
  isMobile,
}) => {
  const { token } = await shareWorkspaceProject(page, PROJECT);
  const { guest, close } = await openAsGuest(page, baseURL, token);

  // The first visit opens How it works, saying who invited them to which project.
  const invitation = `${E2E_COMPANY.name} has invited you to review ${PROJECT}. Click anywhere to leave feedback.`;
  const guide = guest.getByRole("dialog", { name: "How it works" });
  await expect(guide).toHaveAccessibleDescription(invitation);
  await guest.keyboard.press("Escape");
  // The comments panel's notice opens with the same invitation (phones show a shorter note).
  if (!isMobile) {
    await expect(guest.getByTestId("client-notice")).toHaveText(
      `${invitation} Only ${E2E_COMPANY.name} can resolve, edit or delete comments.`,
    );
  }

  const brand = guest.getByTestId("guest-brand");
  await expect(brand.getByTestId("guest-brand-name")).toHaveText(E2E_COMPANY.name);
  await expect(brand).toContainText("Shared review");
  // No logo or color yet: the company's monogram on neutral navy, and no accent rule.
  await expect(brand.getByTestId("brand-logo")).toHaveCount(0);
  await expect(brand.getByTestId("brand-monogram")).toHaveText("EA");
  await expect(brand.getByTestId("brand-monogram")).toHaveCSS("background-color", "rgb(1, 45, 97)");
  await expect(guest.getByTestId("accent-rule")).toHaveCount(0);

  await brandWorkspace({ color: COLOR, logo: snapshotPng(64, 64) });
  await guest.reload();
  const logo = brand.getByTestId("brand-logo");
  await expect(logo).toBeVisible();
  await expect(brand.getByTestId("brand-monogram")).toHaveCount(0);
  await expect
    .poll(() => logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth))
    .toBe(64);
  // Found by the token and a version of the logo, nothing else.
  const src = new URL((await logo.getAttribute("src")) ?? "", baseURL);
  expect(`${src.pathname}${src.search}`).toMatch(
    new RegExp(`^/api/s/${token}/brand/logo\\?v=[0-9a-f]{16}$`),
  );
  await expect(guest.getByTestId("accent-rule")).toBeVisible();
  await expect(guest.getByTestId("accent-rule")).toHaveCSS("background-color", "rgb(224, 59, 157)");
  await guest.getByTestId("review-guide-button").click();
  await expect(
    guide.getByTestId("review-guide-invitation").getByTestId("brand-logo"),
  ).toBeVisible();
  await close();
});

test("an anonymous link keeps Squint's own name and look", async ({ page, baseURL, isMobile }) => {
  const created = await page.request.post("/api/shares", {
    headers: { "x-forwarded-for": "203.0.113.21" },
    data: {
      project: { name: PROJECT, source: { kind: "url", url: "https://example.com/" } },
      snapshots: [],
      comments: [],
    },
  });
  expect(created.status()).toBe(201);
  const { token } = (await created.json()) as { token: string };
  await brandWorkspace({ color: COLOR, logo: snapshotPng(64, 64) });
  const { guest, close } = await openAsGuest(page, baseURL, token);
  const guide = guest.getByRole("dialog", { name: "How it works" });
  await expect(guide).toHaveAccessibleDescription("Here's how to leave feedback on this project.");
  await guest.keyboard.press("Escape");
  if (!isMobile) {
    await expect(guest.getByTestId("client-notice")).toHaveText(
      "You can browse this project and add comments. Only the project owner can resolve, edit or delete them.",
    );
  }
  await expect(guest.getByTestId("guest-brand-name")).toHaveText("Squint");
  await expect(guest.getByTestId("brand-logo")).toHaveCount(0);
  // Squint's own mark, not a monogram: an anonymous link has no company to stand in for.
  await expect(guest.getByTestId("brand-monogram")).toHaveCount(0);
  await expect(guest.getByTestId("accent-rule")).toHaveCount(0);
  await close();
});

test("nothing a guest gets names the workspace, an account or a storage path", async ({
  page,
  baseURL,
  playwright,
}) => {
  const { token } = await shareWorkspaceProject(page, PROJECT);
  await brandWorkspace({ color: COLOR, logo: snapshotPng(64, 64) });
  const forbidden = [
    await e2eWorkspaceId(),
    ...(await userIds()),
    E2E_ADMIN.email,
    E2E_COMPANY.email,
  ];

  const guestApi = await playwright.request.newContext({ baseURL, storageState: SIGNED_OUT });
  const html = await guestApi.get(`/s/${token}`);
  expect(html.status()).toBe(200);
  const unfurl = await guestApi.get(`/s/${token}`, {
    headers: { "user-agent": "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)" },
  });
  // The RSC payload a client-side navigation fetches, apart from the HTML.
  const flight = await guestApi.get(`/s/${token}`, { headers: { RSC: "1" } });
  expect(flight.status()).toBe(200);
  const view = await guestApi.get(`/api/s/${token}`);
  expect(view.status()).toBe(200);
  const cards = await Promise.all(
    ["opengraph-image", "twitter-image"].map((name) => guestApi.get(`/s/${token}/${name}`)),
  );
  for (const card of cards) expect(card.status()).toBe(200);
  const logo = await guestApi.get(`/api/s/${token}/brand/logo`);
  expect(logo.status()).toBe(200);
  const { guest, close } = await openAsGuest(page, baseURL, token);
  await expect(
    guest.getByTestId("review-guide-invitation").getByTestId("brand-logo"),
  ).toBeVisible();
  await expect(guest.getByTestId("guest-brand").getByTestId("brand-logo")).toBeVisible();

  const answers = {
    html: await html.text(),
    unfurl: await unfurl.text(),
    flight: await flight.text(),
    view: await view.text(),
    logoHeaders: JSON.stringify(logo.headers()),
    cardHeaders: JSON.stringify(cards.map((card) => card.headers())),
    rendered: await guest.content(),
  };
  expect(answers.flight).toContain(E2E_COMPANY.name);
  expect(JSON.parse(answers.view)).toMatchObject({
    brand: { custom: true, name: E2E_COMPANY.name, color: COLOR, hasLogo: true },
  });
  for (const [where, text] of Object.entries(answers)) {
    for (const secret of forbidden) expect(text, `${where} names ${secret}`).not.toContain(secret);
    expect(text, `${where} has no storage path`).not.toContain("ws/");
  }
  await close();
  await guestApi.dispose();
});
