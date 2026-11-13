import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./test";
import {
  INVITATION_CARD_ALT,
  invitationPreview,
  MAIN_PREVIEW,
  SHARED_REVIEW_PREVIEW,
} from "../lib/link-preview";
import { E2E_COMPANY } from "./e2e-env";
import { snapshotPng } from "./sample-snapshot";
import { revokeWorkspaceLink, setLinkPassword, shareWorkspaceProject } from "./squint-fixtures";
import { brandWorkspace } from "./workspace-db";

/** Unfurlers get metadata in <head> (Next streams it to other user agents). */
const SLACKBOT = "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)";
const CARD = { width: 1200, height: 630 };

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#x27;": "'",
  "&lt;": "<",
};

/** Meta tag contents by property or name (og:*, twitter:*, robots, referrer). */
function metaTags(html: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const [, key, content] of html.matchAll(
    /<meta (?:property|name)="([^"]+)" content="([^"]*)"/g,
  )) {
    if (key && content !== undefined) {
      tags.set(
        key,
        content.replace(/&(amp|quot|#x27|lt);/g, (entity) => ENTITIES[entity] ?? ""),
      );
    }
  }
  return tags;
}

async function unfurl(request: APIRequestContext, path: string, status = 200) {
  const response = await request.get(path, { headers: { "user-agent": SLACKBOT } });
  expect(response.status()).toBe(status);
  return metaTags(await response.text());
}

/** The tag's value, failing the test when it's missing. */
function tag(tags: Map<string, string>, key: string): string {
  const value = tags.get(key);
  expect(value, `${key} is set`).toBeTruthy();
  return value ?? "";
}

/**
 * Fetches an image by its absolute URL's path (or a path), against this server, checks it is
 * a card PNG, and returns its bytes. `from` sets the caller's address.
 */
async function expectCard(
  request: APIRequestContext,
  imageUrl: string,
  from?: string,
): Promise<Buffer> {
  const url = new URL(imageUrl, "http://localhost");
  const response = await request.get(`${url.pathname}${url.search}`, {
    ...(from ? { headers: { "x-forwarded-for": from } } : {}),
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  const png = await response.body();
  expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
  expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
  expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual(CARD);
  return png;
}

/** The generic shared review cards' bytes (deterministic renders), for Open Graph and X. */
async function genericCards(request: APIRequestContext) {
  return {
    og: await expectCard(request, "/s/opengraph-image"),
    twitter: await expectCard(request, "/s/twitter-image"),
  };
}

/** Whether `/s/<token>`'s own cards are byte for byte the generic ones. */
async function expectGenericCards(request: APIRequestContext, token: string, from?: string) {
  const generic = await genericCards(request);
  const og = await expectCard(request, `/s/${token}/opengraph-image`, from);
  const twitter = await expectCard(request, `/s/${token}/twitter-image`, from);
  expect(og.equals(generic.og), `/s/${token}/opengraph-image is the generic card`).toBe(true);
  expect(twitter.equals(generic.twitter), `/s/${token}/twitter-image is generic`).toBe(true);
}

function expectLargeCard(tags: Map<string, string>, imagePath: string): void {
  const image = tag(tags, "og:image");
  expect(image).toMatch(/^https?:\/\//);
  expect(new URL(image).pathname).toBe(imagePath);
  expect(tag(tags, "og:image:width")).toBe(String(CARD.width));
  expect(tag(tags, "og:image:height")).toBe(String(CARD.height));
  expect(tag(tags, "og:image:alt")).toBeTruthy();
  expect(tag(tags, "twitter:card")).toBe("summary_large_image");
  expect(tag(tags, "twitter:image")).toMatch(/^https?:\/\//);
}

test("the home page unfurls as the branded Squint card", async ({ request }) => {
  const tags = await unfurl(request, "/");
  expect(tag(tags, "og:title")).toBe(MAIN_PREVIEW.title);
  expect(tag(tags, "og:description")).toBe(MAIN_PREVIEW.description);
  expect(tag(tags, "og:site_name")).toBe("Squint");
  expect(tag(tags, "og:type")).toBe("website");
  // The one page og:url is set on: an absolute URL for / on the site's own origin.
  const url = new URL(tag(tags, "og:url"));
  expect(url.pathname).toBe("/");
  expect(url.origin).toBe(new URL(tag(tags, "og:image")).origin);
  expectLargeCard(tags, "/opengraph-image");
  await expectCard(request, tag(tags, "og:image"));
  await expectCard(request, tag(tags, "twitter:image"));
});

test("other pages inherit the main card but don't claim / as their URL", async ({ request }) => {
  // A project page only its owner's browser knows, a folder page and the sandbox.
  for (const path of ["/p/some-project", "/f/some-folder", "/sandbox"]) {
    const tags = await unfurl(request, path);
    expect(tag(tags, "og:title"), path).toBe(MAIN_PREVIEW.title);
    expectLargeCard(tags, "/opengraph-image");
    expect(tags.has("og:url"), `${path} has no og:url`).toBe(false);
  }
});

test("a workspace's review link unfurls as its invitation, with a card of its own", async ({
  page,
  request,
}) => {
  const project = "Spring launch";
  const { token } = await shareWorkspaceProject(page, project);
  await brandWorkspace({ color: "#e03b9d", logo: snapshotPng(64, 64) });
  const copy = invitationPreview({ company: E2E_COMPANY.name, project, client: null });

  const tags = await unfurl(request, `/s/${token}`);
  expect(tag(tags, "og:title")).toBe(copy.title);
  expect(tag(tags, "og:description")).toBe(copy.description);
  expect(tag(tags, "twitter:title")).toBe(copy.title);
  expect(tag(tags, "twitter:description")).toBe(copy.description);
  expect(tag(tags, "robots")).toContain("noindex");
  expect(tag(tags, "referrer")).toBe("no-referrer");
  // The card is this link's own, found by its token alone.
  expectLargeCard(tags, `/s/${token}/opengraph-image`);
  expect(new URL(tag(tags, "twitter:image")).pathname).toBe(`/s/${token}/twitter-image`);
  expect(tags.has("og:url"), "no og:url").toBe(false);
  const generic = await genericCards(request);
  const ogCard = await expectCard(request, tag(tags, "og:image"));
  const twitterCard = await expectCard(request, tag(tags, "twitter:image"));
  expect(ogCard.equals(generic.og), "the og card is not the generic one").toBe(false);
  expect(twitterCard.equals(generic.twitter), "the X card is not the generic one").toBe(false);
  const card = await request.get(new URL(tag(tags, "og:image")).pathname);
  expect(card.headers()["cache-control"]).toBe("private, max-age=300");

  // Another link of the same workspace has a card of its own.
  const fall = await shareWorkspaceProject(page, "Fall menu");
  const other = await unfurl(request, `/s/${fall.token}`);
  expect(tag(other, "og:title")).toBe(
    invitationPreview({ company: E2E_COMPANY.name, project: "Fall menu", client: null }).title,
  );
  expect(tag(other, "og:image")).not.toBe(tag(tags, "og:image"));
  const otherCard = await expectCard(request, tag(other, "og:image"));
  expect(otherCard.equals(ogCard), "each link draws its own project").toBe(false);
});

test("a password-protected workspace link unfurls as it did before its password, project and all", async ({
  page,
  request,
}) => {
  const project = "Locked launch";
  const { token, projectId } = await shareWorkspaceProject(page, project);
  const open = await unfurl(request, `/s/${token}`);
  const openCard = await expectCard(request, tag(open, "og:image"));
  await setLinkPassword(page, projectId, "launch password");

  const tags = await unfurl(request, `/s/${token}`);
  const copy = invitationPreview({ company: E2E_COMPANY.name, project, client: null });
  expect(tag(tags, "og:title")).toBe(copy.title);
  expect(tag(tags, "og:description")).toBe(copy.description);
  expect(tag(tags, "twitter:title")).toBe(copy.title);
  expect(tag(tags, "og:image:alt")).toBe(INVITATION_CARD_ALT);
  expectLargeCard(tags, `/s/${token}/opengraph-image`);
  // The same card, drawn with the project's name, as before the password.
  const card = await expectCard(request, tag(tags, "og:image"));
  expect(card.equals(openCard), "the protected card is the open link's card").toBe(true);
  // Nothing more of the project: not the site it reviews.
  for (const [key, value] of tags) expect(value, key).not.toContain("example.com");
});

test("a revoked workspace link is a 404 with the generic card", async ({ page, request }) => {
  const { token, projectId } = await shareWorkspaceProject(page, "Withdrawn");
  expect(tag(await unfurl(request, `/s/${token}`), "og:title")).toContain("Withdrawn");
  await revokeWorkspaceLink(page, projectId);

  const tags = await unfurl(request, `/s/${token}`, 404);
  expect(tag(tags, "og:title")).toBe(SHARED_REVIEW_PREVIEW.title);
  expect(new URL(tag(tags, "og:image")).pathname).toBe("/s/opengraph-image");
  for (const [key, value] of tags) expect(value, key).not.toContain("Withdrawn");
  // Asked for directly, its own cards are now the generic ones: they say nothing about the link.
  await expectGenericCards(request, token);
});

test("past its limit, a caller gets the generic card instead of a render", async ({
  page,
  request,
}) => {
  const { token } = await shareWorkspaceProject(page, "Rate limited");
  // 60 per-link cards a minute per address; made-up tokens count, and never render.
  const flood = "203.0.113.90";
  for (let index = 0; index < 60; index += 1) {
    const response = await request.get(`/s/${"f".repeat(43)}/opengraph-image`, {
      headers: { "x-forwarded-for": flood },
    });
    expect(response.status()).toBe(200);
  }
  await expectGenericCards(request, token, flood);
  // Another address still gets the link's own card.
  const generic = await genericCards(request);
  const own = await expectCard(request, `/s/${token}/opengraph-image`, "203.0.113.91");
  expect(own.equals(generic.og)).toBe(false);
});

test("a shared review unfurls generically, without project, client or token", async ({
  request,
}) => {
  const secret = "Acme Secret Relaunch";
  const created = await request.post("/api/shares", {
    // Share creation is limited per client address (10 a minute); a documentation-range
    // address keeps this request out of the budget share.spec's browsers rely on.
    headers: { "x-forwarded-for": "203.0.113.7" },
    data: {
      project: { name: secret, source: { kind: "url", url: "https://acme.example/launch" } },
      snapshots: [],
      comments: [],
    },
  });
  expect(created.status()).toBe(201);
  const { token } = (await created.json()) as { token: string };

  const tags = await unfurl(request, `/s/${token}`);
  expect(tag(tags, "og:title")).toBe(SHARED_REVIEW_PREVIEW.title);
  expect(tag(tags, "og:description")).toBe(SHARED_REVIEW_PREVIEW.description);
  expect(tag(tags, "twitter:title")).toBe(SHARED_REVIEW_PREVIEW.title);
  expect(tag(tags, "robots")).toContain("noindex");
  expect(tag(tags, "referrer")).toBe("no-referrer");
  expectLargeCard(tags, "/s/opengraph-image");
  expect(tags.has("og:url"), "no og:url, so no token").toBe(false);
  for (const [key, value] of tags) {
    expect(value, key).not.toContain(token);
    expect(value, key).not.toContain(secret);
    expect(value, key).not.toContain("acme.example");
  }
  await expectCard(request, tag(tags, "og:image"));
  await expectCard(request, tag(tags, "twitter:image"));
  // Its own card, asked for directly, is the generic one too.
  await expectGenericCards(request, token);
});

test("an unknown share token is still a 404, and its card is the same generic image", async ({
  request,
}) => {
  const token = "x".repeat(43);
  const tags = await unfurl(request, `/s/${token}`, 404);
  expect(tag(tags, "og:title")).toBe(SHARED_REVIEW_PREVIEW.title);
  expect(tags.has("og:url")).toBe(false);
  const image = tag(tags, "og:image");
  expect(new URL(image).pathname).toBe("/s/opengraph-image");
  expect(image).not.toContain(token);
  await expectCard(request, image);
  // Made-up and malformed tokens' own cards are the generic bytes, never a render of their own.
  await expectGenericCards(request, token);
  await expectGenericCards(request, "not-a-token");
});
