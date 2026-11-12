"use client";

import { useMemo, useState } from "react";
import { ownerApi, shareUrl } from "@/lib/share-client/api";
import { pushNow, resetSync, syncNow } from "@/lib/share-client/owner-sync";
import { toShareState } from "@/lib/share-client/share-state";
import { useShareFit } from "@/lib/share-client/use-share-fit";
import { useShareSync } from "@/lib/share-client/use-share-sync";
import {
  REVIEW_WINDOW_LABELS,
  reviewClosed,
  reviewDeadline,
  windowChoice,
  windowHours,
  type ReviewWindowChoice,
} from "@/lib/share/review-window";
import { setReviewWindow, shareProject, unshareProject } from "@/lib/store/actions";
import { commentsFor } from "@/lib/store/selectors";
import { snapshotsFor } from "@/lib/store/snapshots";
import type { Project, ProjectShare, SquintData } from "@/lib/store/types";
import { useIsClient } from "@/lib/use-is-client";
import { useNow } from "@/lib/use-now";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Icon } from "../ui/Icon";
import { useToast, type ToastInput } from "../ui/ToastProvider";
import { ShareDialog } from "./ShareDialog";

interface ShareControlProps {
  data: SquintData;
  project: Project;
}

interface RevokeJob {
  projectId: string;
  toast: (toast: ToastInput) => void;
  setRevoking: (revoking: boolean) => void;
}

/**
 * Revokes the link through the workspace (one already gone counts as done).
 * Module-level, so the failure toast's Retry can run it again without a
 * self-referencing closure.
 */
async function revokeLink(job: RevokeJob): Promise<void> {
  const { projectId, toast, setRevoking } = job;
  setRevoking(true);
  const result = await unshareProject(projectId);
  setRevoking(false);
  if (!result.ok) {
    toast({
      tone: "error",
      message: "The link couldn't be revoked.",
      action: { label: "Retry", onAction: () => void revokeLink(job) },
    });
    return;
  }
  resetSync(projectId);
  toast({ message: "Link revoked. It no longer opens this project." });
}

const CREATE_FAILED = "The link couldn't be created. Check your connection and try again.";

/** The server has nowhere lasting to keep links (no database on this deployment). */
const STORAGE_UNAVAILABLE =
  "Sharing isn't set up on this site yet. It needs a database to store links, so ask whoever runs Squint to connect one.";

/**
 * Whether choosing `choice` would close a review that's still open: its
 * deadline, counted from the link's creation, has already passed. Then the
 * owner confirms first.
 */
function closesNow(share: ProjectShare, choice: ReviewWindowChoice, now: number): boolean {
  const endsAt = reviewDeadline(share.createdAt, windowHours(choice));
  return reviewClosed(endsAt, now) && !reviewClosed(share.reviewEndsAt, now);
}

/** The owner's Share button and dialog, and the sync that runs while the project is shared. */
export function ShareControl({ data, project }: ShareControlProps) {
  const toast = useToast();
  const isClient = useIsClient();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The window a new link gets; a link's own comes from the server. */
  const [newWindow, setNewWindow] = useState<ReviewWindowChoice>("72h");
  /**
   * A shorter window waiting on the owner's confirmation, since it closes the
   * review now. Kept after the question closes, so its words don't change as it fades.
   */
  const [shortening, setShortening] = useState<{ to: ReviewWindowChoice; asking: boolean }>({
    to: "24h",
    asking: false,
  });
  const [savingWindow, setSavingWindow] = useState(false);
  const [windowError, setWindowError] = useState<string | null>(null);
  const { share } = project;
  const state = useMemo(
    () => toShareState(project, commentsFor(data, project.id), snapshotsFor(data, project.id)),
    [data, project],
  );
  const status = useShareSync(project, share ? JSON.stringify(state) : null);
  const url = share && isClient ? shareUrl(share.token) : null;
  // Checked while the dialog offers to create a link, so a project too big to share says so first.
  const fit = useShareFit(data, project, open && (!share || status.phase === "gone"));

  const create = async () => {
    if (fit.status !== "fits") return;
    setCreating(true);
    setError(null);
    if (status.phase === "gone") {
      await unshareProject(project.id);
      resetSync(project.id);
    }
    // Just the project: the sync that follows sends everything else in batches.
    const created = await ownerApi.create({ project: state.project, snapshots: [], comments: [] });
    if (!created.ok) {
      setCreating(false);
      setError(created.error === "storage-unavailable" ? STORAGE_UNAVAILABLE : CREATE_FAILED);
      return;
    }
    // The server's creation time: the review window counts from it, whatever this clock says.
    const { shareId, token, ownerKey, createdAt } = created.value;
    const hours = windowHours(newWindow);
    const saved = await shareProject(project.id, {
      id: shareId,
      token,
      ownerKey,
      createdAt,
      cursor: 0,
      reviewWindowHours: hours,
      reviewEndsAt: reviewDeadline(createdAt, hours),
    });
    setCreating(false);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    void pushNow(project.id);
  };

  const stopAsking = () => setShortening((current) => ({ ...current, asking: false }));

  const saveWindow = async (choice: ReviewWindowChoice) => {
    stopAsking();
    setSavingWindow(true);
    setWindowError(null);
    const saved = await setReviewWindow(project.id, windowHours(choice));
    setSavingWindow(false);
    // Refused: the store has put the window back, and says why.
    if (!saved.ok) setWindowError(saved.error);
  };

  const chooseWindow = (choice: ReviewWindowChoice) => {
    if (!share || status.phase === "gone") {
      setNewWindow(choice);
      return;
    }
    if (closesNow(share, choice, Date.now())) setShortening({ to: choice, asking: true });
    else void saveWindow(choice);
  };

  const revoke = () => {
    setConfirming(false);
    if (share) void revokeLink({ projectId: project.id, toast, setRevoking });
  };

  const failing = share && (status.phase === "error" || status.pullHeld);
  // The dialog says how long is left; the button only whether clients can still comment.
  const closed = Boolean(share && now && reviewClosed(share.reviewEndsAt, now));
  const linkWindow =
    share && status.phase !== "gone" ? windowChoice(share.reviewWindowHours) : null;
  const shareLabel = share
    ? `Share (link is on${closed ? ", but the review window has closed" : ""})`
    : "Share";
  return (
    <>
      {failing ? (
        <Button
          variant="danger-ghost"
          size="sm"
          onClick={() => syncNow(project.id)}
          className="max-sm:size-11 max-sm:px-0"
          // Named by its text (sr-only on phones), so the spoken name matches the visible one.
          title="The share link isn't in sync yet"
          data-testid="sync-retry"
        >
          <Icon name="alert" className="size-4" />
          <span className="max-sm:sr-only">Not synced · Retry</span>
        </Button>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className="max-sm:size-11 max-sm:px-0"
        aria-label={shareLabel}
        title={closed ? "Review window closed" : undefined}
        data-testid="share-button"
      >
        <span className="relative">
          <Icon name="link" className="size-5" />
          {share ? (
            // Closed: a hollow muted ring, not a pale fill, so it differs by shape as well as
            // colour and keeps 3:1 against the button (WCAG 1.4.1, 1.4.11).
            <span
              aria-hidden="true"
              className={`absolute -top-0.5 -right-0.5 size-2 rounded-pill ring-2 ${
                closed ? "bg-card ring-muted" : "bg-resolved ring-card"
              }`}
            />
          ) : null}
        </span>
        <span className="max-sm:sr-only">Share</span>
      </Button>
      <ShareDialog
        open={open && !confirming && !shortening.asking}
        onClose={() => setOpen(false)}
        share={share}
        url={url}
        status={status}
        fit={fit}
        creating={creating}
        revoking={revoking}
        error={error}
        reviewWindow={linkWindow ?? newWindow}
        savingWindow={savingWindow}
        windowError={windowError}
        onReviewWindowChange={chooseWindow}
        onCreate={() => void create()}
        onRetry={() => syncNow(project.id)}
        onRevoke={() => setConfirming(true)}
      />
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Revoke this link?"
        description="The link stops working for clients, and the copy on the server is deleted. Comments already in this project stay here."
        confirmLabel="Revoke link"
        onConfirm={revoke}
      />
      <ConfirmDialog
        open={shortening.asking}
        onClose={stopAsking}
        title="Close the review now?"
        description={`This link was created more than ${
          REVIEW_WINDOW_LABELS[shortening.to]
        } ago, so clients can't add comments as soon as you change it. They can still open the link and read every comment, and a longer window opens it again.`}
        confirmLabel="Change and close review"
        onConfirm={() => void saveWindow(shortening.to)}
      />
    </>
  );
}
