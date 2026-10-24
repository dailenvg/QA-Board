import { describe, expect, it } from "vitest";
import { IMAGE_EXPORT, URL_EXPORT } from "@/test/export-fixture";
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
      "- **Original image:** [source-image.png](source-image.png), next to this file",
    );
    const bare = toMarkdown(buildExportDocument(IMAGE_EXPORT), { withFiles: false });
    expect(bare).toContain("- **Original image:** `source-image.png` in the ZIP export");
    expect(zipMarkdown).not.toContain("Original image");
    expect(image).toContain("x 300 px, y 450 px on a 1200 × 900 px image");
    expect(image).toContain("## Resolved comments (0, for context only)\n\nNone yet.");
  });
});
