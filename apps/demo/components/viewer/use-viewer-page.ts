import { useCallback, useState } from "react";
import { pagesOf } from "@/lib/store/pages";
import type { Page, Project } from "@/lib/store/types";
import { useShortcut } from "@/lib/use-shortcut";

export interface ViewerPage {
  /** The page shown; null on a website. */
  page: Page | null;
  /** Its 1-based number, and how many pages there are (0 on a website). */
  number: number;
  total: number;
  selectPage: (pageId: string) => void;
  /** Shows the page `step` pages away, when there is one. */
  step: (step: -1 | 1) => void;
}

const PAGE_PARAM = "page";

/** The page a `?page=<n>` deep link asks for, if it's one of `pages`. */
function linkedPage(pages: readonly Page[]): string | null {
  const wanted = Number(new URLSearchParams(window.location.search).get(PAGE_PARAM));
  return Number.isInteger(wanted) ? (pages[wanted - 1]?.id ?? null) : null;
}

/** Keeps `?page=<n>` on the address, so a link opens the same page. Replaces, never adds history. */
function linkPage(number: number): void {
  const url = new URL(window.location.href);
  url.searchParams.set(PAGE_PARAM, String(number));
  window.history.replaceState(window.history.state, "", url);
}

/**
 * The page shown of a page project: `initialPageId` (such as a restored
 * draft's), else the one a `?page=<n>` link names, else the first. Choosing a
 * page keeps it on the address. With several pages, PageUp / PageDown and
 * `[` / `]` step through them (not while typing).
 */
export function useViewerPage(project: Project, initialPageId: string | null): ViewerPage {
  const pages = pagesOf(project);
  const [pageId, setPageId] = useState<string | null>(() => initialPageId ?? linkedPage(pages));
  const index = Math.max(
    0,
    pages.findIndex((page) => page.id === pageId),
  );
  const page = pages[index] ?? null;
  const several = pages.length > 1;

  const selectPage = useCallback(
    (id: string) => {
      const found = pages.findIndex((entry) => entry.id === id);
      if (found < 0) return;
      setPageId(id);
      if (pages.length > 1) linkPage(found + 1);
    },
    [pages],
  );

  const step = (by: -1 | 1) => {
    const next = pages[index + by];
    if (next) selectPage(next.id);
  };

  useShortcut("pageup", () => step(-1), several);
  useShortcut("pagedown", () => step(1), several);
  useShortcut("[", () => step(-1), several);
  useShortcut("]", () => step(1), several);

  return { page, number: page ? index + 1 : 0, total: pages.length, selectPage, step };
}
