import { useCallback, useMemo, useState } from "react";
import { useCapture } from "@/lib/capture/use-capture";
import { snapshotsFor } from "@/lib/store/snapshots";
import type { Comment, Project, SquintData } from "@/lib/store/types";
import { stageSurface, surfaceTargetOf } from "./surface";
import type { ViewerMode } from "./types";

/**
 * Mode, the snapshot being viewed, and snapshot capture for one project.
 * Leaving Comment mode on a website returns to the latest snapshot next time.
 */
export function useViewerSurface(project: Project, data: SquintData) {
  const kind = project.source.kind;
  const [mode, setModeState] = useState<ViewerMode>("browse");
  const [viewedId, setViewedId] = useState<string | null>(null);
  const list = useMemo(() => snapshotsFor(data, project.id), [data, project.id]);
  const snapshots = useMemo(() => new Map(list.map((entry) => [entry.id, entry])), [list]);
  const latest = list.at(-1) ?? null;
  const viewed = (viewedId && snapshots.get(viewedId)) || null;
  const surface = stageSurface(kind, mode, viewed, latest);
  const capture = useCapture(project.id, kind === "url" ? project.source.url : null, () =>
    setViewedId(null),
  );

  const setMode = useCallback(
    (next: ViewerMode) => {
      setModeState(next);
      if (next === "browse" && kind === "url") setViewedId(null);
    },
    [kind],
  );

  const showSurfaceOf = (comment: Comment) => {
    const target = surfaceTargetOf(comment, kind, snapshots, latest?.id ?? null);
    if (!target) return;
    if (target.mode) setModeState(target.mode);
    setViewedId(target.viewedSnapshotId);
  };

  return {
    mode,
    setMode,
    surface,
    snapshots,
    latest,
    capture,
    showSurfaceOf,
    showLatest: () => setViewedId(null),
  };
}
