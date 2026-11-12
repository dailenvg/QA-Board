/** An unsent comment, kept per shared link for this browser tab. */
export interface StoredDraft {
  x: number;
  y: number;
  body: string;
  surfaceKey: string;
  snapshotId: string | null;
  /** Missing on drafts kept before pages. */
  pageId?: string | null;
  commentId: string;
  author?: string;
}

export interface DraftStorage {
  load: () => StoredDraft | null;
  save: (draft: StoredDraft | null) => void;
  /** What a restored draft says about itself; the viewer's own reload notice without one. */
  restoredNotice?: string;
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
    (draft.pageId === undefined || draft.pageId === null || typeof draft.pageId === "string") &&
    typeof draft.commentId === "string" &&
    (draft.author === undefined || typeof draft.author === "string")
  );
}

/**
 * sessionStorage for a share's unsent draft: it survives a reload or a
 * crash in this tab, and is gone when the tab closes for good. It's also kept
 * in memory, so the viewer finds it again after the password screen took its
 * place, even where sessionStorage is refused. The crop is not kept; it's
 * taken again when the comment is sent.
 */
export function createDraftStorage(token: string): DraftStorage {
  const key = `squint:draft:${token}`;
  let kept: StoredDraft | null = null;
  return {
    load() {
      try {
        const stored = sessionStorage.getItem(key);
        if (stored === null) return kept;
        const value: unknown = JSON.parse(stored);
        return isDraft(value) ? value : null;
      } catch {
        return kept;
      }
    },
    save(draft) {
      kept = draft;
      try {
        if (draft) sessionStorage.setItem(key, JSON.stringify(draft));
        else sessionStorage.removeItem(key);
      } catch {
        // Kept in memory only.
      }
    },
  };
}
