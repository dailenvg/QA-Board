import { useCallback, useMemo, useState } from "react";
import { useViewerBackend } from "@/lib/viewer-backend/backend";
import { useCapture, type CaptureState } from "@/lib/capture/use-capture";
import { pageAddress, pageKey } from "@/lib/page-address";
import {
  BREAKPOINT_WIDTH,
  breakpointOf,
  breakpointOfComment,
  type Breakpoint,
} from "@/lib/store/breakpoints";
import { latestSnapshotOf, pageOfComment, pageOfSnapshot } from "@/lib/store/site-pages";
import { snapshotsFor } from "@/lib/store/snapshots";
import type { Comment, Project, Snapshot, SquintData } from "@/lib/store/types";
import { stageSurface, surfaceTargetOf, type StageSource } from "./surface";
import type { ViewerMode } from "./types";
import type { ViewerPage } from "./use-viewer-page";

const IDLE: CaptureState = { status: "idle" };

/**
 * What the live frame shows: set when the reviewer picks a page, and not when
 * the framed site reports its own navigation (it's already there). `id`
 * changes on every pick, so picking the page again reloads it.
 */
export interface FrameTarget {
  url: string;
  id: number;
}

/** Where a page change came from: the address bar (or a comment), or the framed site itself. */
export type PageChange = "pick" | "frame";

/**
 * Mode, breakpoint, the website page and the snapshot being viewed, and
 * snapshot capture for one project. Websites are reviewed per page and
 * breakpoint: each pair has its own latest snapshot, captured from that page
 * at that breakpoint's width. Leaving Comment mode on a website returns to the
 * latest snapshot next time. Page projects show the page `pages` says, which a
 * comment's card can change.
 */
export function useViewerSurface(
  project: Project,
  data: SquintData,
  pages: ViewerPage,
  /** Where to start, such as a restored draft's snapshot (and so its page and breakpoint). */
  initial: { mode: ViewerMode; snapshotId: string | null },
) {
  const kind = project.source.kind;
  const projectUrl = project.source.kind === "url" ? project.source.url : null;
  /** The project's own page; every website comment without a known snapshot is on it. */
  const home = projectUrl ? (pageKey(projectUrl) ?? projectUrl) : "";
  /** Where a page is framed and captured: the project's own page at its exact address (fragment kept). */
  const addressOf = (page: string) => (projectUrl && pageAddress(page, projectUrl)) || page;
  const start = data.snapshots.find((snapshot) => snapshot.id === initial.snapshotId) ?? null;
  const [mode, setModeState] = useState<ViewerMode>(initial.mode);
  const [viewedId, setViewedId] = useState<string | null>(initial.snapshotId);
  // Showing another page puts that page on the stage, not an earlier snapshot.
  const [stagedPageId, setStagedPageId] = useState(pages.page?.id);
  if (stagedPageId !== pages.page?.id) {
    setStagedPageId(pages.page?.id);
    setViewedId(null);
  }
  const [breakpoint, setBreakpointState] = useState<Breakpoint>(() =>
    start ? breakpointOf(start.width) : "desktop",
  );
  const [sitePage, setSitePage] = useState(() => (start ? pageOfSnapshot(start, home) : home));
  const [frame, setFrame] = useState<FrameTarget>(() => ({ url: addressOf(sitePage), id: 0 }));
  /** The breakpoint and page the last capture was for, so its failure only shows there. */
  const [capturedFor, setCapturedFor] = useState(`${breakpoint} ${sitePage}`);
  const list = useMemo(() => snapshotsFor(data, project.id), [data, project.id]);
  const snapshots = useMemo(() => new Map(list.map((entry) => [entry.id, entry])), [list]);
  const latestOf = useCallback(
    (at: Breakpoint, page: string = sitePage): Snapshot | null =>
      kind === "url" ? latestSnapshotOf(list, at, page, home) : (list.at(-1) ?? null),
    [kind, list, sitePage, home],
  );
  const latest = latestOf(breakpoint);
  const viewed = (viewedId && snapshots.get(viewedId)) || null;
  const stage: StageSource = pages.page ? { kind: "pages", page: pages.page } : { kind: "url" };
  const surface = stageSurface(stage, mode, viewed, latest);
  const backend = useViewerBackend();
  const captureUrl = kind === "url" ? addressOf(sitePage) : null;
  const capturer = useMemo(
    () =>
      captureUrl
        ? (width: number, signal: AbortSignal) =>
            backend.captureSnapshot(project.id, captureUrl, width, signal)
        : null,
    [backend, project.id, captureUrl],
  );
  const { state: lastCapture, capture } = useCapture(capturer, () => setViewedId(null));
  // One capture runs at a time and shows everywhere; a failure only on its own page and breakpoint.
  const captureState =
    lastCapture.status === "failed" && capturedFor !== `${breakpoint} ${sitePage}`
      ? IDLE
      : lastCapture;

  const setMode = useCallback(
    (next: ViewerMode) => {
      setModeState(next);
      if (next === "browse" && kind === "url") setViewedId(null);
    },
    [kind],
  );

  const setBreakpoint = (next: Breakpoint) => {
    setBreakpointState(next);
    setViewedId(null);
  };

  /** Shows a page of the website in both modes. The frame only reloads when the reviewer picks it. */
  const setPage = (next: string, from: PageChange = "pick") => {
    if (kind !== "url") return;
    if (from === "pick") setFrame((current) => ({ url: addressOf(next), id: current.id + 1 }));
    if (next === sitePage) return;
    setSitePage(next);
    setViewedId(null);
  };

  const captureLatest = useCallback(() => {
    setCapturedFor(`${breakpoint} ${sitePage}`);
    capture(BREAKPOINT_WIDTH[breakpoint]);
  }, [capture, breakpoint, sitePage]);

  const showSurfaceOf = (comment: Comment) => {
    const website = kind === "url";
    const at = website ? breakpointOfComment(comment, snapshots) : breakpoint;
    const page = website ? pageOfComment(comment, snapshots, home) : sitePage;
    const target = surfaceTargetOf(comment, kind, snapshots, latestOf(at, page)?.id ?? null);
    if (!target) return;
    if (target.mode) setModeState(target.mode);
    if (target.pageId) pages.selectPage(target.pageId);
    if (website && page !== sitePage) {
      setSitePage(page);
      setFrame((current) => ({ url: addressOf(page), id: current.id + 1 }));
    }
    setBreakpointState(at);
    setViewedId(target.viewedSnapshotId);
  };

  return {
    mode,
    setMode,
    breakpoint,
    setBreakpoint,
    /** The website page under review (its `pageKey`); empty on page projects. */
    sitePage,
    home,
    setPage,
    frame,
    surface,
    snapshots,
    list,
    latest,
    latestOf,
    capture: { state: captureState, capture: captureLatest, url: captureUrl },
    showSurfaceOf,
    showLatest: () => setViewedId(null),
  };
}
