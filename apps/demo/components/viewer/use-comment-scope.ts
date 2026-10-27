import { useMemo, useState } from "react";
import { pagePath } from "@/lib/page-address";
import type { Breakpoint } from "@/lib/store/breakpoints";
import { pagesOf } from "@/lib/store/pages";
import {
  activeByPage,
  commentsInScope,
  pageOfComment,
  reviewedPages,
} from "@/lib/store/site-pages";
import type { Comment, Project, Snapshot } from "@/lib/store/types";
import { BREAKPOINT_LABEL } from "./BreakpointSwitch";
import type { CardPage } from "./CommentCard";
import type { PageScope } from "./PageFilter";
import type { ViewerPage } from "./use-viewer-page";

interface ScopeInput {
  project: Project;
  /** The project's comments, oldest first. */
  comments: readonly Comment[];
  pages: ViewerPage;
  /** Website state from `useViewerSurface`. */
  site: {
    breakpoint: Breakpoint;
    sitePage: string;
    home: string;
    list: readonly Snapshot[];
    snapshots: ReadonlyMap<string, Snapshot>;
  };
}

/**
 * Which comments the panel lists, and how it names where they are. Page
 * projects list every page, or "This page". Websites list one breakpoint, and
 * the page under review (by default) or every page; each card then says its
 * page. Pins, breakpoint counts and the project's status never depend on this.
 */
export function useCommentScope({ project, comments, pages, site }: ScopeInput) {
  const website = project.source.kind === "url";
  const { breakpoint, sitePage, home, list, snapshots } = site;
  const [scope, setScope] = useState<PageScope>(website ? "page" : "all");
  const sitePages = useMemo(
    () => (website ? reviewedPages(list, home, sitePage) : []),
    [website, list, home, sitePage],
  );
  const siteCounts = useMemo(
    () => (website ? activeByPage(comments, snapshots, home) : new Map<string, number>()),
    [website, comments, snapshots, home],
  );
  const several = website ? sitePages.length > 1 : pages.total > 1;
  const pageId = pages.page?.id;

  const listed = useMemo(() => {
    if (website) {
      const page = several && scope === "all" ? null : sitePage;
      return commentsInScope(comments, snapshots, { breakpoint, page, home });
    }
    return several && scope === "page"
      ? comments.filter((comment) => comment.pageId === pageId)
      : comments;
  }, [website, several, scope, sitePage, comments, snapshots, breakpoint, home, pageId]);

  const pageNumbers = useMemo(
    () => new Map(pagesOf(project).map((page, index) => [page.id, index + 1])),
    [project],
  );
  const pageOf = (comment: Comment): CardPage | null => {
    if (!several) return null;
    if (website) {
      return { label: pagePath(pageOfComment(comment, snapshots, home)), icon: "link" };
    }
    const number = comment.pageId ? pageNumbers.get(comment.pageId) : undefined;
    return number ? { label: `Page ${number}`, icon: "image" } : null;
  };

  /** The page shown, as the filter's tooltip names it. */
  const current = website ? pagePath(sitePage) : `Page ${pages.number}`;
  /** The page shown, mid-sentence. */
  const place = website ? current : `page ${pages.number}`;
  /** Where an empty list is empty, when the project has comments elsewhere. */
  const emptyScope =
    comments.length <= listed.length
      ? undefined
      : !website
        ? place
        : several && scope === "page"
          ? `${place} (${BREAKPOINT_LABEL[breakpoint]})`
          : BREAKPOINT_LABEL[breakpoint];
  const count = listed.length === 1 ? "1 comment" : `${listed.length} comments`;
  /** Like "n projects shown" on folder pages: what "This page" leaves in the list. */
  const announcement = several && scope === "page" ? `${count} on ${place}` : "";

  return {
    listed,
    scope,
    setScope,
    several,
    sitePages,
    siteCounts,
    pageOf,
    current,
    emptyScope,
    announcement,
  };
}
