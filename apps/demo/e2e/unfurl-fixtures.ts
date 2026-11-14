import { expect, type APIRequestContext } from "@playwright/test";

/**
 * Reading a page as a link unfurler does: its meta tags, its icons, and the
 * card images they name. Shared by the link preview specs.
 */

/** Unfurlers get metadata in <head> (Next streams it to other user agents). */
export const SLACKBOT = "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)";
export const CARD = { width: 1200, height: 630 };

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

/** The page's meta tags as Slack's unfurler gets them, after checking its status. */
export async function unfurl(request: APIRequestContext, path: string, status = 200) {
  const response = await request.get(path, { headers: { "user-agent": SLACKBOT } });
  expect(response.status()).toBe(status);
  return metaTags(await response.text());
}

/** The page's icon links (`rel="icon"` and `rel="apple-touch-icon"`), by rel. */
export async function iconLinks(
  request: APIRequestContext,
  path: string,
): Promise<Map<string, string>> {
  const response = await request.get(path, { headers: { "user-agent": SLACKBOT } });
  const links = new Map<string, string>();
  for (const [link] of (await response.text()).matchAll(
    /<link [^>]*rel="(?:icon|apple-touch-icon)"[^>]*>/g,
  )) {
    const rel = /rel="([^"]+)"/.exec(link)?.[1];
    const href = /href="([^"]+)"/.exec(link)?.[1];
    if (rel && href && !links.has(rel)) links.set(rel, href.replace(/&amp;/g, "&"));
  }
  return links;
}

/** The tag's value, failing the test when it's missing. */
export function tag(tags: Map<string, string>, key: string): string {
  const value = tags.get(key);
  expect(value, `${key} is set`).toBeTruthy();
  return value ?? "";
}

/**
 * Fetches an image by its absolute URL's path (or a path), against this server, checks it is
 * a card PNG, and returns its bytes. `from` sets the caller's address.
 */
export async function expectCard(
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

/** The page names a 1200x630 card at `imagePath`, for Open Graph and X alike. */
export function expectLargeCard(tags: Map<string, string>, imagePath: string): void {
  const image = tag(tags, "og:image");
  expect(image).toMatch(/^https?:\/\//);
  expect(new URL(image).pathname).toBe(imagePath);
  expect(tag(tags, "og:image:width")).toBe(String(CARD.width));
  expect(tag(tags, "og:image:height")).toBe(String(CARD.height));
  expect(tag(tags, "og:image:alt")).toBeTruthy();
  expect(tag(tags, "twitter:card")).toBe("summary_large_image");
  expect(tag(tags, "twitter:image")).toMatch(/^https?:\/\//);
}
