import { useCallback, useMemo, useState } from "react";
import {
  NO_FILTER,
  type ProjectFilter,
  type StageFilterValue,
  type StatusFilterValue,
} from "./status-filter";

/**
 * A list's status, label and stage filters. A label no longer among `labels`
 * (cleared from its last project, here or in another tab) stops filtering on
 * its own. A stage stays chosen even once no project is at it: the stage
 * filter shows while it's set, and its empty state offers Show all.
 */
export function useProjectFilter(labels: readonly string[]) {
  const [chosen, setChosen] = useState<ProjectFilter>(NO_FILTER);
  const filter = useMemo<ProjectFilter>(
    () =>
      chosen.label === null || labels.includes(chosen.label) ? chosen : { ...chosen, label: null },
    [chosen, labels],
  );
  const setStatus = useCallback(
    (status: StatusFilterValue) => setChosen((current) => ({ ...current, status })),
    [],
  );
  const setLabel = useCallback(
    (label: string | null) => setChosen((current) => ({ ...current, label })),
    [],
  );
  const setStage = useCallback(
    (stage: StageFilterValue) => setChosen((current) => ({ ...current, stage })),
    [],
  );
  const reset = useCallback(() => setChosen(NO_FILTER), []);
  return { filter, setStatus, setLabel, setStage, reset };
}
