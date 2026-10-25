import { useCallback, useMemo, useState } from "react";
import { useViewerBackend } from "@/lib/viewer-backend/backend";
import { useCapture, type CaptureState } from "@/lib/capture/use-capture";
import {
  BREAKPOINT_WIDTH,
  breakpointOf,
  breakpointOfComment,
  type Breakpoint,
} from "@/lib/store/breakpoints";
import { findPage } from "@/lib/store/pages";
import { snapshotsFor } from "@/lib/store/snapshots";
import type { Comment, Project, Snapshot, SquintData } from "@/lib/store/types";
import { stageSurface, surfaceTargetOf, type StageSource } from "./surface";
import type { ViewerMode } from "./types";

const IDLE: CaptureState = { status: "idle" };

/** The page being viewed (`pageId`, else the first) of a page project. */
function stageSourceOf(project: Project, pageId: string | null): StageSource {
  const { source } = project;
  if (source.kind === "url") return { kind: "url" };
  const page = findPage(project, pageId ?? undefined)?.page ?? source.pages[0];
  if (!page) throw new Error("A page project has no pages.");
  return { kind: "pages", page };
}

/**
 * Mode, breakpoint, the snapshot or page being viewed, and snapshot capture
 * for one project. Websites are reviewed per breakpoint: each has its own
 * latest snapshot, captured at that breakpoint's width. Leaving Comment mode
 * on a website returns to the latest snapshot next time. Page projects show
 * one page at a time (the first, until another is chosen).
 */
export function useViewerSurface(
  project: Project,
  data: SquintData,
  /** Where to start, such as a restored draft's snapshot (and so its breakpoint) or page. */
  initial: { mode: ViewerMode; snapshotId: string | null; pageId: string | null } = {
    mode: "browse",
    snapshotId: null,
    pageId: null,
  },
) {
  const kind = project.source.kind;
  const [mode, setModeState] = useState<ViewerMode>(initial.mode);
  const [viewedId, setViewedId] = useState<string | null>(initial.snapshotId);
  const [pageId, setPageId] = useState<string | null>(initial.pageId);
  const [breakpoint, setBreakpointState] = useState<Breakpoint>(() => {
    const start = data.snapshots.find((snapshot) => snapshot.id === initial.snapshotId);
    return start ? breakpointOf(start.width) : "desktop";
  });
  /** The breakpoint the last capture was for, so its failure only shows there. */
  const [capturedFor, setCapturedFor] = useState<Breakpoint>(breakpoint);
  const list = useMemo(() => snapshotsFor(data, project.id), [data, project.id]);
  const snapshots = useMemo(() => new Map(list.map((entry) => [entry.id, entry])), [list]);
  const latestOf = useCallback(
    (at: Breakpoint): Snapshot | null =>
      kind === "url"
        ? (list.findLast((entry) => breakpointOf(entry.width) === at) ?? null)
        : (list.at(-1) ?? null),
    [kind, list],
  );
  const latest = latestOf(breakpoint);
  const viewed = (viewedId && snapshots.get(viewedId)) || null;
  const surface = stageSurface(stageSourceOf(project, pageId), mode, viewed, latest);
  const backend = useViewerBackend();
  const url = kind === "url" ? project.source.url : null;
  const capturer = useMemo(
    () =>
      url
        ? (width: number, signal: AbortSignal) =>
            backend.captureSnapshot(project.id, url, width, signal)
        : null,
    [backend, project.id, url],
  );
  const { state: lastCapture, capture } = useCapture(capturer, () => setViewedId(null));
  // One capture runs at a time and shows on every breakpoint; a failure only on its own.
  const captureState =
    lastCapture.status === "failed" && capturedFor !== breakpoint ? IDLE : lastCapture;

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

  const captureLatest = useCallback(() => {
    setCapturedFor(breakpoint);
    capture(BREAKPOINT_WIDTH[breakpoint]);
  }, [capture, breakpoint]);

  const showSurfaceOf = (comment: Comment) => {
    const at = kind === "url" ? breakpointOfComment(comment, snapshots) : breakpoint;
    const target = surfaceTargetOf(comment, kind, snapshots, latestOf(at)?.id ?? null);
    if (!target) return;
    if (target.mode) setModeState(target.mode);
    if (target.pageId) setPageId(target.pageId);
    setBreakpointState(at);
    setViewedId(target.viewedSnapshotId);
  };

  return {
    mode,
    setMode,
    breakpoint,
    setBreakpoint,
    surface,
    snapshots,
    latest,
    latestOf,
    capture: { state: captureState, capture: captureLatest },
    showSurfaceOf,
    showLatest: () => setViewedId(null),
  };
}
