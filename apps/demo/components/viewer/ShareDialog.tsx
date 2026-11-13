"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { useSwapVariants } from "@/lib/motion";
import { clientNameError, storedClientName } from "@/lib/share/client-name";
import { inviteCopy, inviteMessage, type InviteDetails } from "@/lib/share/invite-copy";
import { reviewClosed, type ReviewWindowChoice } from "@/lib/share/review-window";
import type { InviteResult } from "@/lib/share-client/invites";
import type { SyncStatus } from "@/lib/share-client/owner-sync";
import type { ShareFit } from "@/lib/share-client/use-share-fit";
import type { Result } from "@/lib/store/store";
import type { ProjectShare } from "@/lib/store/types";
import { useMediaQuery } from "@/lib/use-media-query";
import { useNow } from "@/lib/use-now";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { FieldError } from "../ui/FieldError";
import { Icon } from "../ui/Icon";
import { StateArt } from "../ui/line-art/StateArt";
import { InvitationEmailPreview } from "./InvitationEmailPreview";
import { ReviewWindowControl } from "./ReviewWindowControl";
import { ShareInviteStep } from "./ShareInviteStep";
import { ShareSettingsStep } from "./ShareSettingsStep";
import { panelId, SHARE_TABS, ShareTabs, tabId, type ShareTab } from "./ShareTabs";
import { useShareInvites } from "./use-share-invites";

/** How the workspace meets its clients: for the invitation's preview. */
export interface ShareSender {
  /** The company guests see (the workspace's name). */
  company: string;
  /** "{Name} via Squint", as the inbox shows it. */
  sender: string;
  color: string | null;
}

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  share: ProjectShare | undefined;
  url: string | null;
  status: SyncStatus;
  /** Whether the project fits in a share; a link is only offered once it does. */
  fit: ShareFit;
  creating: boolean;
  revoking: boolean;
  error: string | null;
  /** The link's review window, or the one a new link will get. */
  reviewWindow: ReviewWindowChoice;
  /** A change of the link's window is on its way to the server. */
  savingWindow: boolean;
  /** Why the last change of the window didn't save; null when it did. */
  windowError: string | null;
  onReviewWindowChange: (choice: ReviewWindowChoice) => void;
  /** Sets the link's password, or with null removes it; resolves with the server's answer. */
  onPasswordChange: (password: string | null) => Promise<Result>;
  /** The project's name, as the invitation names it. */
  projectName: string;
  sender: ShareSender;
  /** Saves who the link is for (blank clears it); resolves with the server's answer. */
  onClientNameChange: (name: string) => Promise<Result>;
  /** Emails the link to these addresses; resolves with what came of it. */
  onSendInvites: (addresses: string[]) => Promise<InviteResult>;
  /** Says a send went (a toast). */
  onInvitesSent: (message: string) => void;
  /**
   * The dialog steps aside for a confirmation (closing the review, revoking)
   * and opens again after it: the control the question came from, which gets
   * focus back rather than the Close button.
   */
  returnFocus?: "window" | "revoke" | null;
  onCreate: () => void;
  onRetry: () => void;
  onRevoke: () => void;
}

const TITLE = "Share with clients";
const DESCRIPTION =
  "Clients can view and add comments. Only your team can resolve, edit or delete them.";
const CLOSED =
  "The review window has closed, so clients can't comment and invites can't go out. Choose a longer window or No limit in Settings to reopen it.";
const NAME_SAVE_FAILED = "The client name didn't save. Check your connection and try again.";

/** Phones: a bottom sheet with tabs. Wide windows: the controls beside the preview. */
const PHONE = "(max-width: 39.999rem)";
const WIDE = "(min-width: 64rem)";

const RADIO = '[role="radiogroup"] [role="radio"][tabindex="0"]';

/**
 * The Share window. Before a link exists: its size check, review window and
 * Create link. With one: 1, who's reviewing and how it reaches them (client
 * name, email invites, other ways, the link itself), and 2, its settings
 * (review window, password); beside them on wide screens, a live preview of
 * what the client gets. On phones, a bottom sheet with Invite and Settings
 * tabs and a compact preview. Revoke link and Done stay at the bottom.
 */
export function ShareDialog({
  open,
  onClose,
  share,
  url,
  status,
  fit,
  creating,
  revoking,
  error,
  reviewWindow,
  savingWindow,
  windowError,
  onReviewWindowChange,
  onPasswordChange,
  projectName,
  sender,
  onClientNameChange,
  onSendInvites,
  onInvitesSent,
  returnFocus = null,
  onCreate,
  onRetry,
  onRevoke,
}: ShareDialogProps) {
  const now = useNow();
  const phone = useMediaQuery(PHONE);
  const wide = useMediaQuery(WIDE);
  const swap = useSwapVariants();
  const errorId = useId();
  const tabsId = useId();
  const gone = status.phase === "gone";
  // The store shows a new link before the server has kept it. Hold the link view until it has, so
  // a refused save doesn't flash a link (and announce "Link created.") and then take it back.
  const linked = Boolean(share && url && !gone && !creating);
  // Disabled while checking or too big; aria-disabled keeps it focusable, so the reason is read.
  const blocked = creating || fit.status !== "fits";
  const createLabel =
    fit.status === "checking"
      ? "Checking size…"
      : creating
        ? "Creating link…"
        : gone
          ? "Create a new link"
          : "Create link";
  const linkedView = useRef<HTMLDivElement>(null);
  const createView = useRef<HTMLDivElement>(null);
  const revokeButton = useRef<HTMLButtonElement>(null);
  const wasLinked = useRef(linked);

  // Phones' tab, and which way the last switch went (for the slide).
  const [tab, setTab] = useState<{ value: ShareTab; direction: number }>({
    value: "invite",
    direction: 1,
  });
  const chooseTab = (value: ShareTab) => {
    const from = SHARE_TABS.findIndex((item) => item.value === tab.value);
    const to = SHARE_TABS.findIndex((item) => item.value === value);
    setTab({ value, direction: to >= from ? 1 : -1 });
  };
  /** Bumped to send focus to the review window once it's on screen. */
  const [windowFocus, setWindowFocus] = useState(0);

  // The client's name as typed, for this link; null shows the saved one.
  const shareId = share?.id ?? null;
  const [nameDraft, setNameDraft] = useState<{ shareId: string | null; value: string } | null>(
    null,
  );
  const [nameState, setNameState] = useState<{ status: string; error: string | null }>({
    status: "",
    error: null,
  });
  const savedName = share?.clientName ?? "";
  const nameValue = nameDraft?.shareId === shareId ? nameDraft.value : savedName;

  const invites = useShareInvites({ shareId, onSend: onSendInvites, onSent: onInvitesSent });

  const commitName = async () => {
    const invalid = clientNameError(nameValue);
    if (invalid) {
      setNameState({ status: "", error: invalid });
      return;
    }
    if (storedClientName(nameValue) === (share?.clientName ?? null)) {
      setNameDraft(null);
      setNameState((current) => ({ ...current, error: null }));
      return;
    }
    setNameState({ status: "Saving…", error: null });
    const result = await onClientNameChange(nameValue);
    if (!result.ok) {
      setNameState({ status: "", error: result.error || NAME_SAVE_FAILED });
      return;
    }
    setNameDraft(null);
    setNameState({ status: "Saved", error: null });
  };

  // Creating the link replaces the focused Create button with the link view; the link going
  // away (revoked, or gone in another tab) does the reverse. Carry focus to the view's main
  // control (the client's name, or Create), so it doesn't fall to the page behind the modal.
  useEffect(() => {
    if (open && linked !== wasLinked.current) {
      const view = linked ? linkedView.current : createView.current;
      if (view && !view.contains(document.activeElement)) {
        const main = view.querySelector<HTMLElement>("[data-view-focus]");
        (main ?? view.querySelector<HTMLElement>("button"))?.focus();
      }
    }
    wasLinked.current = linked;
  }, [open, linked]);

  // Back from a confirmation: focus returns to the window's selected choice (the new one, if
  // confirmed) or to Revoke, where the keyboard user left off. Runs after the Dialog's own
  // first focus (child effects run first), so it wins over the Close button.
  useEffect(() => {
    if (!open || !returnFocus) return;
    const target =
      returnFocus === "window"
        ? linkedView.current?.querySelector<HTMLElement>(RADIO)
        : revokeButton.current;
    target?.focus();
  }, [open, returnFocus]);

  // "Go to settings": the review window, once its tab (on a phone) is showing.
  useEffect(() => {
    if (windowFocus === 0) return;
    const frame = requestAnimationFrame(() =>
      linkedView.current?.querySelector<HTMLElement>(RADIO)?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [windowFocus, tab.value]);

  const openSettings = () => {
    if (phone) chooseTab("settings");
    setWindowFocus((count) => count + 1);
  };

  const closed = share ? reviewClosed(share.reviewEndsAt, now) : false;
  const details: InviteDetails | null =
    share && url
      ? {
          company: sender.company,
          project: projectName,
          client: storedClientName(nameValue),
          link: url,
          reviewEndsAt: share.reviewEndsAt,
          hasPassword: share.passwordSetAt !== undefined,
        }
      : null;

  const inviteStep = (step: number | null) =>
    share && url && details ? (
      <ShareInviteStep
        step={step}
        clientName={{
          value: nameValue,
          onChange: (value) => {
            setNameDraft({ shareId, value });
            setNameState((current) => ({
              status: "",
              error: current.error ? clientNameError(value) : null,
            }));
          },
          onCommit: () => void commitName(),
          status: nameState.status,
          error: nameState.error,
        }}
        invites={invites}
        closed={closed ? CLOSED : null}
        onOpenSettings={openSettings}
        message={inviteMessage(details)}
        subject={inviteCopy(details).subject}
        url={url}
        share={share}
        status={status}
        onRetry={onRetry}
      />
    ) : null;

  const settingsStep = (step: number | null) =>
    share ? (
      <ShareSettingsStep
        step={step}
        share={share}
        reviewWindow={reviewWindow}
        savingWindow={savingWindow}
        windowError={windowError}
        onReviewWindowChange={onReviewWindowChange}
        onPasswordChange={onPasswordChange}
        revoking={revoking}
      />
    ) : null;

  const preview = (compact: boolean) =>
    details ? (
      <InvitationEmailPreview
        details={details}
        sender={sender.sender}
        color={sender.color}
        compact={compact}
      />
    ) : null;

  const linkedBody = phone ? (
    <div className="flex flex-col gap-4">
      <ShareTabs value={tab.value} onChange={chooseTab} panelIdPrefix={tabsId} />
      <AnimatePresence mode="wait" initial={false} custom={tab.direction}>
        <motion.div
          key={tab.value}
          role="tabpanel"
          id={panelId(tabsId, tab.value)}
          aria-labelledby={tabId(tabsId, tab.value)}
          custom={tab.direction}
          variants={swap}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="flex flex-col gap-4"
        >
          {tab.value === "invite" ? (
            <>
              {inviteStep(null)}
              {preview(true)}
            </>
          ) : (
            settingsStep(null)
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  ) : wide ? (
    <div className="grid grid-cols-[minmax(0,1fr)_22rem] items-start gap-5">
      <div className="flex min-w-0 flex-col gap-4">
        {inviteStep(1)}
        {settingsStep(2)}
      </div>
      <div className="sticky top-0">{preview(false)}</div>
    </div>
  ) : (
    <div className="flex flex-col gap-4">
      {inviteStep(1)}
      {preview(true)}
      {settingsStep(2)}
    </div>
  );

  const footer = linked ? (
    <div className="flex items-center justify-between gap-3">
      <Button
        ref={revokeButton}
        variant="danger-ghost"
        size="sm"
        aria-disabled={revoking || undefined}
        onClick={revoking ? undefined : onRevoke}
        data-return-focus="revoke"
      >
        <Icon name="trash" className="size-4" />
        {revoking ? "Revoking…" : "Revoke link"}
      </Button>
      <Button variant="secondary" size="sm" onClick={onClose} data-testid="share-done">
        Done
      </Button>
    </div>
  ) : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={TITLE}
      description={DESCRIPTION}
      testId="share-dialog"
      fitKeyboard
      sheet
      size={linked ? "xl" : "md"}
      art={<StateArt scene="invite" size="sm" still />}
      footer={footer}
    >
      {/* Always present, so the change is announced when the link view replaces Create. */}
      <p role="status" className="sr-only">
        {linked ? "Link created." : ""}
      </p>
      <AnimatePresence mode="popLayout" initial={false}>
        {linked ? (
          <motion.div
            key="linked"
            ref={linkedView}
            variants={swap}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {linkedBody}
          </motion.div>
        ) : (
          <motion.div
            key="create"
            ref={createView}
            variants={swap}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col gap-4"
          >
            {gone ? (
              <p role="alert" className="text-body text-muted">
                This project&apos;s share link no longer works. It was revoked, or the server no
                longer has it. Create a new link to share again.
              </p>
            ) : (
              <p className="text-body text-muted">
                Anyone with the link can open this project. Their comments come back here.
              </p>
            )}
            <ReviewWindowControl
              value={reviewWindow}
              onChange={onReviewWindowChange}
              summary="Starts when you create the link."
              saving={false}
              error={null}
              disabled={creating}
            />
            {/* aria-disabled while busy, so keyboard focus stays here if creating fails. */}
            <Button
              onClick={blocked ? undefined : onCreate}
              aria-disabled={blocked || undefined}
              aria-describedby={errorId}
              className="sm:self-end"
              data-view-focus
              data-testid="create-share-link"
            >
              <Icon name="link" className="size-4" />
              {createLabel}
            </Button>
            <FieldError id={errorId} message={fit.status === "too-big" ? fit.message : error} />
          </motion.div>
        )}
      </AnimatePresence>
    </Dialog>
  );
}
