"use client";

import { useMemo, useState } from "react";
import { useBlobSource } from "@/lib/blob-store/blob-source";
import { ownerApi, shareUrl } from "@/lib/share-client/api";
import { createLatestSaves } from "@/lib/share-client/latest-saves";
import { pushNow, resetSync, syncNow } from "@/lib/share-client/owner-sync";
import { toShareState } from "@/lib/share-client/share-state";
import { shareImages, shareSizeProblem } from "@/lib/share-client/share-size";
import { useShareSync } from "@/lib/share-client/use-share-sync";
import {
  REVIEW_WINDOW_LABELS,
  reviewClosed,
  reviewDeadline,
  windowChoice,
  windowHours,
  type ReviewWindowChoice,
} from "@/lib/share/review-window";
import {
  restoreReviewWindow,
  sendShareInvites,
  setReviewWindow,
  setShareClientName,
  setSharePassword,
  shareProject,
  unshareProject,
} from "@/lib/store/actions";
import { commentsFor } from "@/lib/store/selectors";
import { snapshotsFor } from "@/lib/store/snapshots";
import type { Project, ProjectShare, SquintData } from "@/lib/store/types";
import { useIsClient } from "@/lib/use-is-client";
import { useNow } from "@/lib/use-now";
import { useWorkspaceIdentity } from "@/lib/workspace-client/workspace-identity";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Icon } from "../ui/Icon";
import { useToast, type ToastInput } from "../ui/ToastProvider";
import { shareButtonState } from "./share-button-state";
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

/** Every new link opens for 3 days; Settings changes it once the link exists. */
const NEW_WINDOW: ReviewWindowChoice = "72h";

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

/** Stands in outside a workspace (never on a signed-in page), so the invitation never names a blank. */
const UNNAMED = "Your company";

/** The company the invitation comes from, as the workspace's settings have it. */
function useShareCompany(): string {
  return useWorkspaceIdentity()?.name.trim() || UNNAMED;
}

/** The owner's Share button and dialog, and the sync that runs while the project is shared. */
export function ShareControl({ data, project }: ShareControlProps) {
  const toast = useToast();
  const company = useShareCompany();
  const isClient = useIsClient();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  /** Why the link couldn't be made; Try again makes it again. */
  const [error, setError] = useState<string | null>(null);
  /** Why the project is too big to share: no link is made, and there's nothing to try again. */
  const [tooBig, setTooBig] = useState<string | null>(null);
  /**
   * A shorter window waiting on the owner's confirmation, since it closes the
   * review now. Kept after the question closes, so its words don't change as it fades.
   */
  const [shortening, setShortening] = useState<{ to: ReviewWindowChoice; asking: boolean }>({
    to: "24h",
    asking: false,
  });
  /**
   * Window changes still on their way to the server. A count, not a flag: arrowing through the
   * choices sends one per step, and "Saving…" stays until the last has answered.
   */
  const [windowSaves, setWindowSaves] = useState(0);
  const [windowError, setWindowError] = useState<string | null>(null);
  const [windowSaver] = useState(() => createLatestSaves<number | null>());
  /** Which of the dialog's controls asked a question, so focus goes back to it after. */
  const [returnFocus, setReturnFocus] = useState<"window" | "revoke" | null>(null);
  const { share } = project;
  const state = useMemo(
    () => toShareState(project, commentsFor(data, project.id), snapshotsFor(data, project.id)),
    [data, project],
  );
  const status = useShareSync(project, share ? JSON.stringify(state) : null);
  const url = share && isClient ? shareUrl(share.token) : null;
  const blobs = useBlobSource();

  const create = async () => {
    setCreating(true);
    setError(null);
    setTooBig(null);
    // Checked before anything is uploaded, so a project too big to share says so instead.
    let problem: string | null;
    try {
      problem = shareSizeProblem(await shareImages(data, project, (key) => blobs.get(key)));
    } catch {
      setCreating(false);
      setError(CREATE_FAILED);
      return;
    }
    if (problem) {
      setCreating(false);
      setTooBig(problem);
      return;
    }
    const replacing = status.phase === "gone";
    if (replacing) {
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
    const hours = windowHours(NEW_WINDOW);
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
    if (replacing) toast({ message: "The old link had stopped working, so this is a new one." });
  };

  // Opening Share makes the link when there's none (or it stopped working), so the window opens
  // on its steps. A link gone while the window is open waits for the owner's button.
  const openShare = () => {
    setOpen(true);
    if ((!share || status.phase === "gone") && !creating) void create();
  };

  const close = () => {
    setOpen(false);
    setError(null);
    setTooBig(null);
    setReturnFocus(null);
  };

  const stopAsking = () => setShortening((current) => ({ ...current, asking: false }));

  const saveWindow = async (choice: ReviewWindowChoice) => {
    stopAsking();
    if (!share) return;
    setWindowSaves((count) => count + 1);
    setWindowError(null);
    const hours = windowHours(choice);
    const settled = await windowSaver.save(share.reviewWindowHours, hours, () =>
      setReviewWindow(project.id, hours),
    );
    setWindowSaves((count) => count - 1);
    // Only the last save of a burst says how it ended: the newest choice wins.
    if (!settled) return;
    setWindowError(settled.error);
    // Refused: back to the newest window the server confirmed, never to one it refused.
    if (settled.error) restoreReviewWindow(project.id, settled.value);
  };

  const chooseWindow = (choice: ReviewWindowChoice) => {
    if (!share || status.phase === "gone") return;
    if (closesNow(share, choice, Date.now())) {
      setReturnFocus("window");
      setShortening({ to: choice, asking: true });
    } else void saveWindow(choice);
  };

  // Revoking ends this sharing: the window closes rather than making a new link straight away.
  const revoke = () => {
    setConfirming(false);
    close();
    if (share) void revokeLink({ projectId: project.id, toast, setRevoking });
  };

  const failing = share && (status.phase === "error" || status.pullHeld);
  // The dialog says how long is left; the button only whether the link works and takes comments.
  const button = shareButtonState(share, status.phase, now);
  const linkWindow = button.linked && share ? windowChoice(share.reviewWindowHours) : null;
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
        onClick={openShare}
        className="max-sm:size-11 max-sm:px-0"
        aria-label={button.label}
        title={button.title}
        data-testid="share-button"
      >
        <span className="relative">
          <Icon name="link" className="size-5" />
          {button.linked ? (
            // Closed: a hollow muted ring, not a pale fill, so it differs by shape as well as
            // colour and keeps 3:1 against the button (WCAG 1.4.1, 1.4.11).
            <span
              aria-hidden="true"
              className={`absolute -top-0.5 -right-0.5 size-2 rounded-pill ring-2 ${
                button.closed ? "bg-card ring-muted" : "bg-resolved ring-card"
              }`}
            />
          ) : null}
        </span>
        <span className="max-sm:sr-only">Share</span>
      </Button>
      <ShareDialog
        open={open && !confirming && !shortening.asking}
        onClose={close}
        share={share}
        url={url}
        status={status}
        tooBig={tooBig}
        creating={creating}
        revoking={revoking}
        error={error}
        reviewWindow={linkWindow ?? NEW_WINDOW}
        savingWindow={windowSaves > 0}
        windowError={windowError}
        onReviewWindowChange={chooseWindow}
        onPasswordChange={(password) => setSharePassword(project.id, password)}
        projectName={project.name}
        company={company}
        onClientNameChange={(name) => setShareClientName(project.id, name)}
        onSendInvites={(addresses) => sendShareInvites(project.id, addresses)}
        onInvitesSent={(message) => toast({ message })}
        returnFocus={returnFocus}
        onCreate={() => void create()}
        onRetry={() => syncNow(project.id)}
        onRevoke={() => {
          setReturnFocus("revoke");
          setConfirming(true);
        }}
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
        } ago, so clients can't add comments once you make this change. They can still read every comment. Choose a longer window later to reopen the review.`}
        confirmLabel="Change and close review"
        onConfirm={() => void saveWindow(shortening.to)}
      />
    </>
  );
}
