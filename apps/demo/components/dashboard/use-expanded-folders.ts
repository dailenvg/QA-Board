import { useCallback, useEffect, useState } from "react";

/** Which sidebar folders are open, remembered in this browser apart from the workspace data. */
const KEY = "squint:folder-tree";

function readExpanded(): ReadonlySet<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return new Set(
      Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [],
    );
  } catch {
    return new Set();
  }
}

/** The sidebar tree's open folders, kept across visits. Only rendered in the browser. */
export function useExpandedFolders() {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(readExpanded);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...expanded]));
    } catch {
      // Not remembered; the tree still works for this visit.
    }
  }, [expanded]);

  const setOpen = useCallback((folderId: string, open: boolean) => {
    setExpanded((current) => {
      if (current.has(folderId) === open) return current;
      const next = new Set(current);
      if (open) next.add(folderId);
      else next.delete(folderId);
      return next;
    });
  }, []);

  return { expanded, setOpen };
}
