import { useCallback, useState } from "react";
import { readStorage, writeStorage } from "../../core/storage";

const NAME_STORAGE_KEY = "pinpoint:name";

/** Reviewer display name, remembered in localStorage across visits. */
export function useReviewerName(): [string, (name: string) => void] {
  const [name, setName] = useState(() => readStorage("localStorage", NAME_STORAGE_KEY) ?? "");
  const remember = useCallback((next: string) => {
    const trimmed = next.trim();
    writeStorage("localStorage", NAME_STORAGE_KEY, trimmed);
    setName(trimmed);
  }, []);
  return [name, remember];
}
