"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { BlobSourceContext } from "@/lib/blob-store/blob-source";
import { createClientBackend } from "@/lib/share-client/client-backend";
import { createClientStore, toViewerData } from "@/lib/share-client/client-store";
import type { DraftStorage } from "@/lib/share-client/draft-storage";
import { linkNameMemory } from "@/lib/share-client/reviewer-name";
import { createServerBlobs } from "@/lib/share-client/server-blobs";
import { useClientRefresh } from "@/lib/share-client/use-client-refresh";
import { useReviewWindow } from "@/lib/share-client/use-review-window";
import type { ClientBrand, ClientView, LockedShare } from "@/lib/share/types";
import { ViewerBackendContext } from "@/lib/viewer-backend/backend";
import { Icon } from "../ui/Icon";
import { useIsClient } from "@/lib/use-is-client";
import { ViewerSkeleton } from "../viewer/ViewerSkeleton";
import { ViewerView } from "../viewer/ViewerView";
import { accentStyle } from "./brand-accent";
import { BrandLockup } from "./BrandLockup";
import { invitationLine } from "./invitation-copy";
import { ReviewCountdown } from "./ReviewCountdown";
import { ReviewGuideTrigger } from "./ReviewGuideTrigger";
import { ShareUnavailable } from "./ShareUnavailable";

interface SharedReviewProps {
  token: string;
  initial: ClientView;
  /** The reviewer's name remembered for this link (its cookie), so the page renders with it. */
  authorName: string | null;
  /** Where an unsent comment is kept for this link, across reloads and the password screen. */
  draftStorage: DraftStorage;
  /** The link asked for its password again: the password screen takes the review's place. */
  onLocked: (locked: LockedShare) => void;
}

/**
 * While the review is open: the phone note (under the comments sheet's
 * header) and the notice. A workspace's link opens the notice with its
 * invitation and names its company as the one who moderates; an anonymous
 * link says "the project owner".
 */
function clientCopy(brand: ClientBrand, project: string) {
  if (!brand.custom) {
    return {
      note: "You can add comments. Only the project owner can resolve or edit them.",
      notice:
        "You can browse this project and add comments. Only the project owner can resolve, edit or delete them.",
    };
  }
  return {
    note: `You can add comments. Only ${brand.name} can resolve or edit them.`,
    notice: `${invitationLine(brand.name, project)} Only ${brand.name} can resolve, edit or delete comments.`,
  };
}

/** The earlier of two moments (epoch ms), ignoring missing ones; null when neither is set. */
function earliest(a: number | null, b: number | null): number | null {
  const set = [a, b].filter((at): at is number => at !== null && Number.isFinite(at));
  return set.length ? Math.min(...set) : null;
}

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
 * into a workspace, under the brand of the company that shared it. Nothing is saved to this browser's Squint workspace.
 * Comments are taken until the review window closes; then it's read-only.
 */
export function SharedReview({
  token,
  initial,
  authorName,
  draftStorage,
  onLocked,
}: SharedReviewProps) {
  const [store] = useState(() =>
    createClientStore(initial, { authorName, names: linkNameMemory(token) }),
  );
  const [blobs] = useState(() => createServerBlobs(token));
  const backend = useMemo(
    () => createClientBackend({ token, store, blobs }),
    [token, store, blobs],
  );
  // Client-only: an unsent draft is restored from this tab's sessionStorage on first render.
  const isClient = useIsClient();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const { data, project } = useMemo(() => toViewerData(state), [state]);
  useClientRefresh(token, store);
  useEffect(() => store.carryOverAuthorName(), [store]);
  const { locked } = state;
  const lockedBrand = state.view.brand;
  const lockedProjectName = state.view.project.name;
  useEffect(() => {
    if (locked) onLocked({ brand: lockedBrand, projectName: lockedProjectName });
  }, [locked, lockedBrand, lockedProjectName, onLocked]);
  const { reviewEndsAt, reviewWindowHours, expiresAt, brand } = state.view;
  const openCopy = clientCopy(brand, state.view.project.name);
  // A project deleted before its review window ends can't take comments past deletion, so the
  // countdown ends then too: it never promises more time than the deletion notice allows.
  const review = useReviewWindow(earliest(reviewEndsAt, expiresAt), state.reviewClosed);

  if (state.gone) return <ShareUnavailable />;
  if (!isClient) return <ViewerSkeleton />;
  return (
    <BlobSourceContext value={blobs}>
      <ViewerBackendContext value={backend}>
        {/* Layout-free: only carries the company's accent color down to the top bar's rule. */}
        <div className="contents" style={accentStyle(brand.color)}>
          <ViewerView
            data={data}
            project={project}
            leading={<BrandLockup token={token} brand={brand} />}
            accentRule={brand.color !== null}
            actions={
              <>
                {/* A link without a deadline has no countdown, unless the server closed it since. */}
                {review.left || review.closed ? <ReviewCountdown left={review.left} /> : null}
                <ReviewGuideTrigger
                  reviewClosed={review.closed}
                  token={token}
                  brand={brand}
                  project={state.view.project.name}
                  reviewWindowHours={reviewWindowHours}
                />
              </>
            }
            panelNote={review.closed ? CLOSED.note : openCopy.note}
            draftStorage={draftStorage}
            commentLocked={review.closed ? CLOSED.reason : undefined}
            expiresAt={expiresAt ?? undefined}
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
                {/* A real flex item, so it can shrink and break a very long company or project name. */}
                <span className="min-w-0 wrap-break-word">
                  {review.closed ? CLOSED.notice : openCopy.notice}
                </span>
              </p>
            }
          />
        </div>
      </ViewerBackendContext>
    </BlobSourceContext>
  );
}
