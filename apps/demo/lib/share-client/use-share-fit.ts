import { useEffect, useState } from "react";
import { getBlob } from "../blob-store/blob-store";
import type { Project, SquintData } from "../store/types";
import { shareImages, shareSizeProblem } from "./share-size";

/** Whether a project fits in a share link: checked before anything is uploaded. */
export type ShareFit =
  { status: "checking" } | { status: "fits" } | { status: "too-big"; message: string };

/**
 * Checks the project's images in this browser against the share limits while
 * `active` (the share dialog is open without a working link), again whenever
 * the project changes. Until the first answer, the status is "checking".
 */
export function useShareFit(data: SquintData, project: Project, active: boolean): ShareFit {
  const [problem, setProblem] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!active) return;
    let current = true;
    void shareImages(data, project, getBlob).then((images) => {
      if (current) setProblem(shareSizeProblem(images));
    });
    return () => {
      current = false;
    };
  }, [active, data, project]);

  if (problem === undefined) return { status: "checking" };
  return problem ? { status: "too-big", message: problem } : { status: "fits" };
}
