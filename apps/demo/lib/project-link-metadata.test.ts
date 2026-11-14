import { describe, expect, it } from "vitest";
import { MAIN_PREVIEW, teamReviewPreview } from "./link-preview";
import { projectLinkMetadata } from "./project-link-metadata";
import { projectIconPath } from "./share/brand";
import type { ProjectPreview } from "./workspace/project-preview";

const ID = "3f1c9a52-7d1e-4b6a-9c2f-0a8b7e6d5c4b";
const PREVIEW: ProjectPreview = {
  project: "Spring launch",
  company: "ONE Agency",
  color: "#e03b9d",
  logoVersion: "0123456789abcdef",
};
const INHERITED = {
  openGraph: [{ url: "https://squint.test/opengraph-image?abc", width: 1200, height: 630 }],
  twitter: [{ url: "https://squint.test/twitter-image?abc", width: 1200, height: 630 }],
};

const metadata = (preview: ProjectPreview | null, signedIn = false) =>
  projectLinkMetadata({ projectId: ID, preview, signedIn, inherited: INHERITED });

/** Every value in the metadata, flattened, to check nothing names the project. */
const text = (value: unknown) => JSON.stringify(value);

describe("a project link's metadata", () => {
  it("previews a live project, signed out, as its company's card and icon", () => {
    const copy = teamReviewPreview(PREVIEW);
    const result = metadata(PREVIEW);
    expect(result).toMatchObject({
      title: "Sign in",
      robots: { index: false, follow: false },
      referrer: "no-referrer",
      openGraph: { title: copy.title, description: copy.description, siteName: "ONE Agency" },
      twitter: { card: "summary_large_image", title: copy.title },
    });
    // No images named: Next adds the segment's own per-project card.
    expect(result.openGraph).not.toHaveProperty("images");
    expect(result.twitter).not.toHaveProperty("images");
    const icon = projectIconPath(ID, {
      name: "ONE Agency",
      color: "#e03b9d",
      logoVersion: "0123456789abcdef",
    });
    expect(icon).toMatch(new RegExp(`^/api/p/${ID}/brand/icon\\?v=[0-9a-f]{16}$`));
    expect(result.icons).toEqual({
      icon: [{ url: icon, type: "image/png", sizes: "192x192" }],
      apple: [{ url: icon, type: "image/png", sizes: "192x192" }],
    });
  });

  it("previews an id that doesn't open (unknown, trashed, archived, closed) as Squint, naming nothing", () => {
    // The preview is null for all of them alike (`readProjectPreview`), so all answer the same.
    const result = metadata(null);
    expect(result).toMatchObject({
      title: "Sign in",
      referrer: "no-referrer",
      openGraph: { title: MAIN_PREVIEW.title, siteName: "Squint", images: INHERITED.openGraph },
      twitter: { title: MAIN_PREVIEW.title, images: INHERITED.twitter },
    });
    expect(result).not.toHaveProperty("icons");
    expect(text(result)).not.toContain(ID);
  });

  it("keeps a signed-in browser's page as before: Squint's preview, and a referrer for its own posts", () => {
    const result = metadata(PREVIEW, true);
    expect(result).toMatchObject({
      title: "Review",
      robots: { index: false, follow: false },
      openGraph: { title: MAIN_PREVIEW.title, images: INHERITED.openGraph },
    });
    expect(result).not.toHaveProperty("referrer");
    expect(result).not.toHaveProperty("icons");
    expect(text(result)).not.toContain("Spring launch");
    expect(text(result)).not.toContain("ONE Agency");
  });

  it("changes the icon's version when the company's name, color or logo does", () => {
    const icon = (brand: Partial<ProjectPreview>) =>
      (metadata({ ...PREVIEW, ...brand }).icons as { icon: Array<{ url: string }> }).icon[0]?.url;
    const base = icon({});
    expect(icon({ company: "ONE" })).not.toBe(base);
    expect(icon({ color: null })).not.toBe(base);
    expect(icon({ logoVersion: null })).not.toBe(base);
    expect(icon({ project: "Fall menu" })).toBe(base);
  });
});
