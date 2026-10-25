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

  it("keeps hostile comment text from changing the document's structure", () => {
    expect(structure(zipMarkdown)).toEqual([
      "# Squint review: Acme \\*launch\\* \\[v2\\]",
      "## Active comments (2)",
      "### Comment 1",
      "### Comment 3",
      "## Resolved comments (1, for context only)",
      "### Comment 2",
    ]);
    expect(zipMarkdown).toContain("- **Author:** Mia \\*\\*\\[admin\\]\\*\\*");
    expect(zipMarkdown).toContain("````text\n# Not a heading\n```\n## Not a section\n```\n");
  });

  it("embeds screenshots in the ZIP copy and points at the ZIP in the bare one", () => {
    expect(zipMarkdown).toContain("![Screenshot for comment 3](screenshots/03-cccc3333.png)");
    expect(bareMarkdown).not.toContain("![");
    expect(bareMarkdown).toContain("`screenshots/03-cccc3333.png` in the ZIP export");
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
      "  - Page 1, `Page 1` (1600 × 900 px): not included (left out to keep the export small)",
    );
    expect(deck).toContain(
      "- **Location:** 50% from the left, 10% from the top of page 3 = x 800 px, y 90 px on a 1600 × 900 px page",
    );
    expect(deck).toContain("- **Page:** 3 of 3, `Page 3`; image [pages/03.webp](pages/03.webp)");
    expect(deck).toContain("![Screenshot for comment 2](screenshots/02-p02-ffff6666.png)");
    expect(deck).toContain("Page images, when included, are in `pages/`.");
  });
});
