"use client";

import { useCallback } from "react";
import { setProjectStage } from "@/lib/store/actions";
import { STAGE_LABEL } from "@/lib/store/stage";
import type { Project, ProjectStage } from "@/lib/store/types";
import { useToast } from "../ui/ToastProvider";

const COPY = {
  set: (stage: ProjectStage) => `Stage set to ${STAGE_LABEL[stage]}`,
  removed: "Stage removed",
  failed: "Couldn't change the stage.",
  undo: "Undo",
  retry: "Retry",
} as const;

interface StageChangeOptions {
  /** After Undo puts the stage back, such as putting focus on the project's card again. */
  onUndo?: (projectId: string) => void;
}

/**
 * Changes a project's stage the way every surface does: at once, then a toast naming the new
 * stage with Undo, which puts the one before back. A save the server refuses is rolled back,
 * and an error toast offers Retry. The toast region is the live region: nothing else speaks.
 */
export function useStageChange({ onUndo }: StageChangeOptions = {}) {
  const toast = useToast();
  return useCallback(
    (project: Project, stage: ProjectStage | null) => {
      const previous = project.stage ?? null;
      if (previous === stage) return;
      const save = (to: ProjectStage | null) => {
        void setProjectStage(project.id, to).then((result) => {
          if (result.ok) return;
          toast({
            tone: "error",
            message: COPY.failed,
            action: { label: COPY.retry, onAction: () => save(to) },
          });
        });
      };
      save(stage);
      toast({
        message: stage ? COPY.set(stage) : COPY.removed,
        action: {
          label: COPY.undo,
          onAction: () => {
            save(previous);
            onUndo?.(project.id);
          },
        },
      });
    },
    [toast, onUndo],
  );
}
