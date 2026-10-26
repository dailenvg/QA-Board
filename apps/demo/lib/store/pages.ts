import type { Comment, Page, Project } from "./types";

/**
 * The id of the single page an image project gets when it's migrated from
 * version 2. A constant, so the share server's own migration (006) gives a
 * shared copy the same id without knowing which project it came from.
 */
export const MIGRATED_PAGE_ID = "page-1";

/** Most pages one project holds (PDF imports offer the first 50). */
export const MAX_PAGES = 50;

/**
 * A page's name where it adds something: a PDF page's "Page 3" only repeats
 * its number, so it's left out (null).
 */
export function distinctPageName(name: string, number: number): string | null {
  return name.trim() === `Page ${number}` ? null : name;
}

/** A project's pages in reading order; none for a website. */
export function pagesOf(project: Project): readonly Page[] {
  return project.source.kind === "pages" ? project.source.pages : [];
}

/** The page with `pageId` and its 1-based number, or null when the project has none such. */
export function findPage(
  project: Project,
  pageId: string | undefined,
): { page: Page; number: number } | null {
  if (pageId === undefined) return null;
  const pages = pagesOf(project);
  const index = pages.findIndex((page) => page.id === pageId);
  const page = pages[index];
  return page ? { page, number: index + 1 } : null;
}

/**
 * Puts a comment on a surface its project has: website comments never carry
 * a page, a comment on a snapshot carries no page, and every other comment
 * on a page project carries one of its pages (the first, when its own is
 * unknown). Returns the comment itself when nothing had to change.
 */
export function placeComment(comment: Comment, project: Project): Comment {
  const { pageId, ...rest } = comment;
  if (project.source.kind === "url" || comment.snapshotId) {
    return pageId === undefined ? comment : rest;
  }
  if (findPage(project, pageId)) return comment;
  const first = project.source.pages[0];
  return first ? { ...rest, pageId: first.id } : rest;
}
