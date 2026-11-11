import { useCallback, useMemo, useState } from "react";
import { NO_FILTER, type ProjectFilter, type StatusFilterValue } from "./status-filter";

/**
 * A list's status and label filters. A label no longer among `labels` (cleared
 * from its last project, here or in another tab) stops filtering on its own.
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
  const reset = useCallback(() => setChosen(NO_FILTER), []);
  return { filter, setStatus, setLabel, reset };
}
