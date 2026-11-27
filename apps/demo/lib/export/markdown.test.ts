import { describe, expect, it } from "vitest";
import { IMAGE_EXPORT, PAGES_EXPORT, URL_EXPORT } from "@/test/export-fixture";
import { buildExportDocument } from "./build-document";
import { toMarkdown } from "./markdown";

const zipMarkdown = toMarkdown(buildExportDocument(URL_EXPORT), { withFiles: true });
const bareMarkdown = toMarkdown(buildExportDocument(URL_EXPORT), { withFiles: false });

/** Headings outside fenced blocks: the document's real structure. */
function structure(markdown: string): string[] {
  let fence: string | null = null;
  const headings: string[] = [];
  for (const line of markdown.split("\n")) {
    const opener = /^(`{3,})/.exec(line)?.[1];
    if (fence) {
      if (line === fence) fence = null;
    } else if (opener) {
      fence = opener;
    } else if (line.startsWith("#")) {
      headings.push(line);
    }
  }
  return headings;
}

describe("toMarkdown", () => {
  it("matches the reviewed example", async () => {
    await expect(zipMarkdown).toMatchFileSnapshot("__snapshots__/comments.example.md.snap");
  });

  it("leaves browser details out, of comments and replies", () => {
    const clientInfo = { userAgent: "Mozilla/5.0 (Test UA)", dpr: 2 };
    const comments = URL_EXPORT.comments.map((comment) => ({ ...comment, clientInfo }));
    const replies = URL_EXPORT.replies.map((reply) => ({ ...reply, clientInfo }));
    const markdown = toMarkdown(buildExportDocument({ ...URL_EXPORT, comments, replies }), {
      withFiles: true,
    });
    expect(markdown).toBe(zipMarkdown);
  });

  it("lists each comment's replies under its request, oldest first, their words verbatim", () => {
    expect(zipMarkdown).toContain(
      "**Replies:**\n\n- Leo, 2026-10-24T09:00:46.000Z (edited 2026-10-24T09:00:47.000Z):\n\n  ```text\n  Escaped it in the next build.\n  ```\n\n- Cleo \\[client\\], 2026-10-24T09:00:48.000Z:",
    );
    // The reply's own fence and heading stay inside a longer fence, indented under its item.
    expect(zipMarkdown).toContain(
      "  ````text\n  Still broken on mobile.\n\n  ```\n  ## Not a heading either\n  ```\n  ````",
    );
    const bare = toMarkdown(buildExportDocument({ ...URL_EXPORT, replies: [] }), {
      withFiles: true,
    });
    expect(bare).not.toContain("**Replies:**");
  });

  it("marks team-only comments and replies in the team's export", () => {
    const comments = URL_EXPORT.comments.map((comment) =>
      comment.id === "bbbb2222-old" ? { ...comment, teamOnly: true as const } : comment,
    );
    const replies = URL_EXPORT.replies.map((reply) =>
      reply.id === "r-team" ? { ...reply, teamOnly: true as const } : reply,
    );
    const markdown = toMarkdown(buildExportDocument({ ...URL_EXPORT, comments, replies }), {
      withFiles: true,
    });
    expect(structure(markdown)).toContain("### Comment T1 · Team only · Nit");
    expect(markdown).toContain("![Screenshot for comment T1](screenshots/T01-bbbb2222.png)");
    expect(markdown).toContain("- (Team only) Leo, ");
    expect(markdown).not.toContain("- (Team only) Cleo");
    // Under a team-only comment, its heading covers the thread.
    expect(markdown).not.toContain("- (Team only) Ana");
  });

  it("keeps hostile comment text from changing the document's structure", () => {
    expect(structure(zipMarkdown)).toEqual([
      "# Squint review: Acme \\*launch\\* \\[v2\\]",
      "## Active comments (2)",
      "### Comment 1",
      "### Comment 3 · Must fix",
      "## Resolved comments (1, for context only)",
      "### Comment 2 · Nit",
    ]);
    expect(zipMarkdown).toContain("- **Author:** Mia \\*\\*\\[admin\\]\\*\\*");
    expect(zipMarkdown).toContain("````text\n# Not a heading\n```\n## Not a section\n```\n");
  });

  it("embeds screenshots in the ZIP copy and points at the ZIP in the bare one", () => {
    expect(zipMarkdown).toContain("![Screenshot for comment 3](screenshots/03-cccc3333.jpg)");
    expect(bareMarkdown).not.toContain("![");
    expect(bareMarkdown).toContain("`screenshots/03-cccc3333.jpg` in the ZIP export");
    expect(bareMarkdown).toContain("Download the ZIP export from Squint to get them.");
  });

  it("describes image projects by file and size", () => {
    const image = toMarkdown(buildExportDocument(IMAGE_EXPORT), { withFiles: true });
    expect(image).toContain("- **Source:** image `checkout.png` (1200 × 900 px)");
    expect(image).toContain(
      "- **Pages:**\n  - Page 1, `checkout.png` (1200 × 900 px): [pages/01.png](pages/01.png)",
    );
    const bare = toMarkdown(buildExportDocument(IMAGE_EXPORT), { withFiles: false });
    expect(bare).toContain(
      "  - Page 1, `checkout.png` (1200 × 900 px): `pages/01.png` in the ZIP export",
    );
    expect(zipMarkdown).not.toContain("**Pages:**");
    expect(image).toContain("of page 1 = x 300 px, y 450 px on a 1200 × 900 px image");
    expect(image).toContain("## Resolved comments (0, for context only)\n\nNone yet.");
  });

  it("labels every comment with its page, and lists each page's image or why it's missing", () => {
    const deck = toMarkdown(buildExportDocument(PAGES_EXPORT), { withFiles: true });
    expect(deck).toContain("- **Source:** PDF `deck.pdf`, 3 pages");
    expect(deck).toContain(
      "  - Page 1 (1600 × 900 px): not included (left out to keep the export small)",
    );
    expect(deck).toContain(
      "- **Location:** 50% from the left, 10% from the top of page 3 = x 800 px, y 90 px on a 1600 × 900 px page",
    );
    expect(deck).toContain("- **Page:** 3 of 3; image [pages/03.webp](pages/03.webp)");
    expect(deck).toContain("![Screenshot for comment 2](screenshots/02-p02-ffff6666.jpg)");
    expect(deck).toContain("Page images, when included, are in `pages/`.");
  });
});
