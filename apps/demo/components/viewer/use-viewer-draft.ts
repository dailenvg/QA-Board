import { useEffect, useState } from "react";
import type { DraftStorage } from "@/lib/share-client/draft-storage";
import type { Draft } from "./types";

const RESTORED = "This comment wasn't sent before the page closed. Retry to post it, or cancel it.";

/** A draft kept from before a reload, shown as unsent until it's posted. */
function restoreDraft(storage: DraftStorage | undefined): Draft | null {
  const stored = storage?.load();
  return stored
    ? { ...stored, pageId: stored.pageId ?? null, sending: false, error: RESTORED, crop: null }
    : null;
}

/**
 * The comment being written. With `storage` (shared links), a draft with
 * text is kept across reloads, comes back marked unsent, and leaving the page
 * asks first.
 */
export function useViewerDraft(storage: DraftStorage | undefined) {
  const [draft, setDraft] = useState<Draft | null>(() => restoreDraft(storage));
  const unsent = Boolean(storage && draft?.body.trim());

  // Keep the draft with text across a reload; drop it once posted or cancelled.
  useEffect(() => {
    if (!storage) return;
    if (!draft?.body.trim()) {
      storage.save(null);
      return;
    }
    const { x, y, body, surfaceKey, snapshotId, pageId, commentId, author } = draft;
    storage.save({
      x,
      y,
      body,
      surfaceKey,
      snapshotId,
      pageId,
      commentId,
      ...(author ? { author } : {}),
    });
  }, [draft, storage]);

  // Leaving with an unsent comment asks first.
  useEffect(() => {
    if (!unsent) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsent]);

  return [draft, setDraft] as const;
}
