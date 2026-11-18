"use client";

import { useEffect, useState } from "react";

/** A row's control to focus: the workspace's id, and the control's test id. */
interface FocusTarget {
  workspaceId: string;
  control: "workspace-menu" | "workspace-unarchive";
}

/**
 * Focus for a workspace that moved between the lists (archived, or
 * unarchived): the control that pressed it went with its old row, so focus
 * follows the row to its new list, onto the control it has there. Two
 * frames later, after a closing dialog has put focus back where it could.
 */
export function useMovedRowFocus(): (target: FocusTarget) => void {
  const [target, setTarget] = useState<FocusTarget | null>(null);
  useEffect(() => {
    if (!target) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const row = `[data-workspace-id="${CSS.escape(target.workspaceId)}"]`;
        document
          .querySelector<HTMLElement>(`${row} [data-testid="${target.control}"]`)
          ?.focus({ preventScroll: false });
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [target]);
  return (next) => setTarget({ ...next });
}
