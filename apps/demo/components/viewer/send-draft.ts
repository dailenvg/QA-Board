import { prepareCrop, type TakeCrop } from "@/lib/crop/prepare-crop";
import type { Result } from "@/lib/store/store";
import type { Comment } from "@/lib/store/types";
import { NOT_SENT, type ReadyCrop } from "@/lib/viewer-backend/backend";

interface SendDraftOptions {
  /** The screenshot rendered on an earlier try; null renders one now. */
  crop: ReadyCrop | null;
  /** Reads the screen for a screenshot; null where there's none to take (a live frame). */
  takeCrop: TakeCrop | null;
  /** A screenshot try failed and another is coming. */
  onCropRetry: () => void;
  post: (crop: ReadyCrop | null) => Promise<Result<Comment>>;
}

export interface SentDraft {
  result: Result<Comment>;
  /** The screenshot that went with it, kept for a retry; null when there was none. */
  crop: ReadyCrop | null;
}

/**
 * Sends a draft: its screenshot first, a required step that's retried
 * (`prepareCrop`), then the comment, which goes without one once every try
 * failed. Always settles with the outcome, so Send never stays busy: anything
 * unexpected is an error the composer offers to retry. Call it synchronously
 * from the submit handler, so the first take reads the screen as it is.
 */
export async function sendDraft({
  crop,
  takeCrop,
  onCropRetry,
  post,
}: SendDraftOptions): Promise<SentDraft> {
  let ready = crop;
  try {
    if (!ready && takeCrop) ready = await prepareCrop(takeCrop, { onRetry: onCropRetry });
    return { result: await post(ready), crop: ready };
  } catch {
    return { result: { ok: false, error: NOT_SENT }, crop: ready };
  }
}
