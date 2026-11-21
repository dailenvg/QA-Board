import { useState } from "react";
import type { ProjectFilter } from "./status-filter";

const keyOf = ({ status, label }: ProjectFilter) => `${status}\n${label ?? ""}`;

/**
 * What a filter's live region says: `message` as it was when `filter` last
 * changed, and nothing before it ever has. A background read (the minute's
 * poll, another tab's change) that changes the count leaves it as it was, so
 * the region speaks when the person changes the filter, not when data arrives.
 */
export function useFilterAnnouncement(message: string, filter: ProjectFilter): string {
  const key = keyOf(filter);
  const [spoken, setSpoken] = useState({ key, message: "" });
  // Set while rendering, so the words change in the same render as the list they describe.
  if (spoken.key !== key) setSpoken({ key, message });
  return spoken.message;
}
