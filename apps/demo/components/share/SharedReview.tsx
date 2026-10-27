"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { BlobSourceContext } from "@/lib/blob-store/blob-source";
import { createClientBackend } from "@/lib/share-client/client-backend";
import { createClientStore, toViewerData } from "@/lib/share-client/client-store";
import { createDraftStorage } from "@/lib/share-client/draft-storage";
import { createServerBlobs } from "@/lib/share-client/server-blobs";
import { useClientRefresh } from "@/lib/share-client/use-client-refresh";
import { useReviewWindow } from "@/lib/share-client/use-review-window";
import type { ClientView } from "@/lib/share/types";
import { ViewerBackendContext } from "@/lib/viewer-backend/backend";
import { Logo } from "../brand/Logo";
import { Icon } from "../ui/Icon";
import { useIsClient } from "@/lib/use-is-client";
import { ViewerSkeleton } from "../viewer/ViewerSkeleton";
import { ViewerView } from "../viewer/ViewerView";
import { ReviewCountdown } from "./ReviewCountdown";
import { ReviewGuideTrigger } from "./ReviewGuideTrigger";
import { ShareUnavailable } from "./ShareUnavailable";

interface SharedReviewProps {
  token: string;
  initial: ClientView;
}

/** The phone version, under the comments sheet's header. */
const CLIENT_NOTE = "You can add comments. Only the project owner can resolve or edit them.";

const CLIENT_NOTICE =
  "You can browse this project and add comments. Only the project owner can resolve, edit or delete them.";

/** Once the review window is over: the Comment mode's reason, the phone note and the notice. */
const CLOSED = {
  reason: "The review window has closed, so new comments can't be added.",
  note: "The review window has closed. You can still read every comment.",
  notice:
    "The review window has closed, so new comments can't be added. You can still browse this project and read every comment.",
} as const;

/**
 * A client's view of a shared project: the same viewer, reading from and
 * writing to the share's server, without moderation controls or any link
 * into a workspace. Nothing is saved to this browser's Squint workspace.
 * Comments are taken until the review window closes; then it's read-only.
 */
export function SharedReview({ token, initial }: SharedReviewProps) {
  const [store] = useState(() => createClientStore(initial));
  const [blobs] = useState(() => createServerBlobs(token));
  const backend = useMemo(
    () => createClientBackend({ token, store, blobs }),
    [token, store, blobs],
  );
  const draftStorage = useMemo(() => createDraftStorage(token), [token]);
  // Client-only: an unsent draft is restored from this tab's sessionStorage on first render.
  const isClient = useIsClient();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const { data, project } = useMemo(() => toViewerData(state), [state]);
  useClientRefresh(token, store);
  const { reviewEndsAt, expiresAt } = state.view;
  // A project deleted before its review window ends can't take comments past deletion, so the
  // countdown ends then too: it never promises more time than the deletion notice allows.
  const review = useReviewWindow(
    Number.isFinite(expiresAt) ? Math.min(reviewEndsAt, expiresAt) : reviewEndsAt,
    state.reviewClosed,
  );

  if (state.gone) return <ShareUnavailable />;
  if (!isClient) return <ViewerSkeleton />;
  return (
    <BlobSourceContext value={blobs}>
      <ViewerBackendContext value={backend}>
        <ViewerView
          data={data}
          project={project}
          leading={
            <span className="pl-2">
              <Logo linked={false} caption="Shared review" compact />
            </span>
          }
          actions={
            <>
              <ReviewCountdown left={review.left} />
              <ReviewGuideTrigger reviewClosed={review.closed} />
            </>
          }
          panelNote={review.closed ? CLOSED.note : CLIENT_NOTE}
          draftStorage={draftStorage}
          commentLocked={review.closed ? CLOSED.reason : undefined}
          expiresAt={expiresAt}
          panelNotice={
            <p
              data-testid="client-notice"
              data-review={review.closed ? "closed" : "open"}
              className="mx-3 flex items-start gap-2 rounded-tile bg-card px-4 py-3 text-meta text-muted"
            >
              <Icon
                name={review.closed ? "clock" : "message"}
                className="mt-0.5 size-4 shrink-0 text-ink-2"
              />
              {review.closed ? CLOSED.notice : CLIENT_NOTICE}
            </p>
          }
        />
      </ViewerBackendContext>
    </BlobSourceContext>
  );
}
