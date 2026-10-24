/** An unsent comment, kept per shared link for this browser tab. */
export interface StoredDraft {
  x: number;
  y: number;
  body: string;
  surfaceKey: string;
  snapshotId: string | null;
  commentId: string;
  author?: string;
}

export interface DraftStorage {
  load: () => StoredDraft | null;
  save: (draft: StoredDraft | null) => void;
}

function isDraft(value: unknown): value is StoredDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;
  return (
    typeof draft.x === "number" &&
    typeof draft.y === "number" &&
    typeof draft.body === "string" &&
    typeof draft.surfaceKey === "string" &&
    (draft.snapshotId === null || typeof draft.snapshotId === "string") &&
    typeof draft.commentId === "string" &&
    (draft.author === undefined || typeof draft.author === "string")
  );
}

/**
 * sessionStorage for a share's unsent draft: it survives a reload or a
 * crash in this tab, and is gone when the tab closes for good. The crop is
 * not kept; it's taken again when the comment is sent.
 */
export function createDraftStorage(token: string): DraftStorage {
  const key = `squint:draft:${token}`;
  return {
    load() {
      try {
        const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
        return isDraft(value) ? value : null;
      } catch {
        return null;
      }
    },
    save(draft) {
      try {
        if (draft) sessionStorage.setItem(key, JSON.stringify(draft));
        else sessionStorage.removeItem(key);
      } catch {
        // Not kept; nothing else depends on it.
      }
    },
  };
}
