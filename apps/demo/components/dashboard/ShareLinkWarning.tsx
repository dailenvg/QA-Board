"use client";

import { useNow } from "@/lib/use-now";
import { Icon } from "../ui/Icon";
import { shareLinkWarning, type DeletedPlace } from "./share-link-warning";

interface ShareLinkWarningProps {
  /** When each share link going with it ends its review window (`reviewEndsAt`; null: never). */
  reviewEnds: readonly (number | null)[];
  place: DeletedPlace;
}

/**
 * In a delete dialog: that clients on the share links lose access, and when the
 * last one's review window ends. Nothing without a link. In the danger tint the
 * share dialog warns in; not an alert, since it's there as the dialog opens and
 * is read with the rest of its description. Body size, as the description around
 * it: it's what the delete decides on, not a footnote, and 16px on phones.
 */
export function ShareLinkWarning({ reviewEnds, place }: ShareLinkWarningProps) {
  const now = useNow();
  const warning = shareLinkWarning(reviewEnds, now, place);
  if (!warning) return null;
  return (
    <p
      data-testid="share-link-warning"
      className="flex items-start gap-2 rounded-tile bg-danger-soft p-3 text-body text-danger"
    >
      <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
      <span>{warning}</span>
    </p>
  );
}
