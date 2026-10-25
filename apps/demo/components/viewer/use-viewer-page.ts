import { useState } from "react";
import { findPage } from "@/lib/store/pages";
import type { Page, Project } from "@/lib/store/types";

export interface ViewerPage {
  /** The page shown; null on a website. */
  page: Page | null;
  selectPage: (pageId: string) => void;
}

/** The page shown of a page project: `initialPageId` (such as a restored draft's), else the first. */
export function useViewerPage(project: Project, initialPageId: string | null): ViewerPage {
  const [pageId, setPageId] = useState<string | null>(initialPageId);
  const { source } = project;
  const page =
    source.kind === "pages"
      ? (findPage(project, pageId ?? undefined)?.page ?? source.pages[0] ?? null)
      : null;
  return { page, selectPage: setPageId };
}
