import type { Project, ProjectSource } from "@/lib/store/types";
import { displayHost } from "@/lib/url";
import type { IconName } from "../ui/Icon";

/** What a project was made from, as its type tag and search results show it. */
export interface ProjectKind {
  label: "Website" | "Image" | "PDF";
  icon: IconName;
}

const KINDS = {
  url: { label: "Website", icon: "globe" },
  image: { label: "Image", icon: "image" },
  pdf: { label: "PDF", icon: "fileText" },
} as const satisfies Record<string, ProjectKind>;

/** A website, an image (one or several combined, or a website's screenshot), or a PDF. */
export function projectKind(source: ProjectSource): ProjectKind {
  return source.kind === "url" ? KINDS.url : KINDS[source.origin];
}

/**
 * The line under a card's name: a website's host, "N images" for combined
 * images, a screenshot's original host, else the uploaded file's name.
 */
export function sourceLabel(project: Project): string {
  const { source } = project;
  if (source.kind === "url") return displayHost(source.url);
  if (source.origin === "image" && source.pages.length > 1) return `${source.pages.length} images`;
  return source.referenceUrl ? `${displayHost(source.referenceUrl)} · screenshot` : source.fileName;
}
