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
  /**
   * After a toast's Undo or Retry, as the toast and its button leave: where focus goes, such as
   * the project's card again, or the viewer's stage menu.
   */
  onUndo?: (projectId: string) => void;
}

/**
 * Changes a project's stage the way every surface does: at once, then a toast naming the new
 * stage with Undo, which puts the one before back. A save the server refuses is rolled back,
 * and an error toast offers Retry; once a retry is saved, the stage's toast (with Undo) says so,
 * so the fix is heard as the failure was. The toast region is the live region: nothing else
 * speaks.
 */
export function useStageChange({ onUndo }: StageChangeOptions = {}) {
  const toast = useToast();
  return useCallback(
    (project: Project, stage: ProjectStage | null) => {
      const previous = project.stage ?? null;
      if (previous === stage) return;
      /**
       * `retried`: a Retry, whose toast has gone, so the save announces itself once it lands (a
       * toast shown from the Retry click itself would be cleared with the error toast).
       */
      function save(to: ProjectStage | null, from: ProjectStage | null, retried: boolean) {
        void setProjectStage(project.id, to).then((result) => {
          if (result.ok) {
            if (retried) announce(to, from);
            return;
          }
          toast({
            tone: "error",
            message: COPY.failed,
            action: {
              label: COPY.retry,
              onAction: () => {
                save(to, from, true);
                onUndo?.(project.id);
              },
            },
          });
        });
      }
      /** Names `to`, with Undo back to `from`. */
      function announce(to: ProjectStage | null, from: ProjectStage | null) {
        toast({
          message: to ? COPY.set(to) : COPY.removed,
          action: {
            label: COPY.undo,
            onAction: () => {
              save(from, to, false);
              onUndo?.(project.id);
            },
          },
        });
      }
      save(stage, previous, false);
      announce(stage, previous);
    },
    [toast, onUndo],
  );
}
