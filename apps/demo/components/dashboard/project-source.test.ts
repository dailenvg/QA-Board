import { describe, expect, it } from "vitest";
import type { Page, PagesSource, Project, ProjectSource } from "@/lib/store/types";
import { projectKind, sourceLabel } from "./project-source";

const page = (id: string): Page => ({ id, blobKey: `page:${id}`, name: `${id}.png` });

const pages = (count: number, extra: Partial<PagesSource> = {}): PagesSource => ({
  kind: "pages",
  origin: "image",
  fileName: "home.png",
  pages: Array.from({ length: count }, (_, index) => page(`p${index + 1}`)),
  ...extra,
});

const project = (source: ProjectSource): Project => ({
  id: "p",
  folderId: "f",
  name: "Homepage",
  source,
  createdAt: 1,
  updatedAt: 1,
});

describe("sourceLabel", () => {
  it("counts combined images", () => {
    expect(sourceLabel(project(pages(3)))).toBe("3 images");
    expect(sourceLabel(project(pages(2)))).toBe("2 images");
  });

  it("names a single image's file", () => {
    expect(sourceLabel(project(pages(1)))).toBe("home.png");
  });

  it("leaves websites, screenshots and PDFs as they were", () => {
    expect(sourceLabel(project({ kind: "url", url: "https://www.example.com/pricing" }))).toBe(
      "example.com",
    );
    expect(sourceLabel(project(pages(1, { referenceUrl: "https://www.example.com/" })))).toBe(
      "example.com · screenshot",
    );
    expect(sourceLabel(project(pages(12, { origin: "pdf", fileName: "deck.pdf" })))).toBe(
      "deck.pdf",
    );
  });
});

describe("projectKind", () => {
  it("names each source type with its icon", () => {
    expect(projectKind({ kind: "url", url: "https://example.com/" })).toEqual({
      label: "Website",
      icon: "globe",
    });
    expect(projectKind(pages(1))).toEqual({ label: "Image", icon: "image" });
    expect(projectKind(pages(3))).toEqual({ label: "Image", icon: "image" });
    expect(projectKind(pages(4, { origin: "pdf" }))).toEqual({ label: "PDF", icon: "fileText" });
  });
});
