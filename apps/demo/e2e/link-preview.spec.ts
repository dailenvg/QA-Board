import { expect, test, type APIRequestContext } from "@playwright/test";
import { MAIN_PREVIEW, SHARED_REVIEW_PREVIEW } from "../lib/link-preview";

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

/** Fetches an image by its absolute URL's path, against this server, and checks it is a card PNG. */
async function expectCard(request: APIRequestContext, imageUrl: string): Promise<void> {
  const url = new URL(imageUrl);
  const response = await request.get(`${url.pathname}${url.search}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  const png = await response.body();
  expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
  expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
  expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual(CARD);
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
});
