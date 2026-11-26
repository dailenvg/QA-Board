"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useRef, useState } from "react";
import { instant, spring, useRevealVariants, useSwapVariants } from "@/lib/motion";
import { absoluteTime, relativeTime } from "@/lib/relative-time";
import type { Breakpoint } from "@/lib/store/breakpoints";
import type { Comment, CommentPriority, Reply } from "@/lib/store/types";
import type { EditOutcome, EditRefusal } from "@/lib/viewer-backend/backend";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { BREAKPOINT_ICON, BREAKPOINT_LABEL } from "./BreakpointSwitch";
import { ClientMark } from "./ClientMark";
import { CommentAuthorAvatar } from "./CommentAuthorAvatar";
import { CommentBadge } from "./CommentBadge";
import { CommentCropThumb } from "./CommentCropThumb";
import { CommentEdited } from "./CommentEdited";
import { CommentEditor, EMPTY_CLIENT_EDIT } from "./CommentEditor";
import { CommentMoreMenu } from "./CommentMoreMenu";
import { CommentTeamNote } from "./CommentTeamNote";
import { CommentThread } from "./CommentThread";
import { showsReplyBox, useCommentThreads } from "./comment-threads";
import { PlacementChip } from "./PlacementChip";
import { PriorityChip } from "./PriorityChip";
import { replyClosedNote } from "./reply-rights";
import { ReplySlot } from "./ReplySlot";
import { CardReplyBox } from "./CardReplyBox";
import { isScreenshotPending } from "./screenshot-pending";
import { ScreenshotPending } from "./ScreenshotPending";
import type { Placement } from "./surface";
import { threadSummary } from "./thread-summary";
import { ThreadSummaryLine } from "./ThreadSummaryLine";

export interface CommentCardActions {
  onSelect: (id: string) => void;
  /**
   * Saves new words: at once (the team's, nothing returned), or once the
   * server answers (a client's, 4.12), while the editor waits and then shows
   * why, if it didn't save.
   */
  onEdit: (id: string, body: string) => Promise<EditOutcome> | void;
  onResolve: (id: string) => void;
  onReopen: (id: string) => void;
  onDelete: (comment: Comment) => void;
  /** The team's "Get info" (browser details) in the card's More menu; guests get none. */
  onGetInfo?: (comment: Comment) => void;
  /** The team's Priority choices in the card's More menu (D10); guests get none. */
  onSetPriority?: (comment: Comment, priority: CommentPriority | null) => void;
  /** Copy link, first in the card's More menu: the team's and a guest's (U6). */
  onCopyLink?: (comment: Comment) => void;
}

interface CommentCardProps extends CommentCardActions {
  comment: Comment;
  number: number;
  /** Where the pin lives, when that isn't the current snapshot. */
  placement: Placement | null;
  /** The page it's on, on projects with several pages. */
  pageNumber: number | null;
  /** The breakpoint it's on, while the list shows every breakpoint's comments. */
  breakpoint: Breakpoint | null;
  /** The pin in surface px, which the crop's thumbnail centres on; null shows the whole crop. */
  cropPin: { x: number; y: number } | null;
  /**
   * The workspace's viewer: shows Resolve/Reopen (anyone in the workspace),
   * and marks client comments. Off on a shared link, whose guest only gets
   * Edit, on their own comments, and Copy link.
   */
  canModerate: boolean;
  /** Shows Edit: the signed-in member's own comment, or a guest's own active one (`commentRights`). */
  canEdit: boolean;
  /** Shows Delete: their own, or anyone's for the owner (`commentRights`). */
  canDelete: boolean;
  /** Says the team resolved it, so its words are locked: a guest's own (`commentRights`). */
  resolvedNote: boolean;
  /** Its editor opened or closed, so the list can keep the card in place meanwhile. */
  onEditing?: (comment: Comment, open: boolean) => void;
  selected: boolean;
  /**
   * Its pin's popover is open, with the thread and the reply box: selected, the card then sums
   * the thread up in a line, as unselected, so one comment never has two boxes on screen.
   */
  threadInPopover?: boolean;
  now: number;
}

/** An edit waiting for the server, or the reason it didn't save. */
interface SaveState {
  pending: boolean;
  error: EditRefusal | null;
}

const SAVE_IDLE: SaveState = { pending: false, error: null };

const NO_REPLIES: readonly Reply[] = [];

/**
 * The guest's own resolved comment: why there's no Edit (4b.16), and no reply box. One note for
 * both, read with the card, so a selected card doesn't say "The team resolved this" twice.
 */
const RESOLVED_NOTE = "The team resolved this, so it can't be edited or replied to.";

/**
 * One comment: select it to find its pin (switching to its snapshot if
 * needed); see what the commenter saw; resolve or reopen it, and edit or
 * delete it where that's the member's to do. Unselected, it sums up its
 * thread in a line; selected, it shows the thread and the reply box (U1),
 * unless its pin's popover has them open.
 */
export function CommentCard({
  comment,
  number,
  placement,
  pageNumber,
  breakpoint,
  cropPin,
  canModerate,
  canEdit,
  canDelete,
  resolvedNote,
  onEditing,
  selected,
  threadInPopover = false,
  now,
  onSelect,
  onEdit,
  onResolve,
  onReopen,
  onDelete,
  onGetInfo,
  onSetPriority,
  onCopyLink,
}: CommentCardProps) {
  const [editing, setEditing] = useState(false);
  const [save, setSave] = useState<SaveState>(SAVE_IDLE);
  const reduce = useReducedMotion();
  const variants = useRevealVariants();
  const swap = useSwapVariants();
  const itemRef = useRef<HTMLLIElement>(null);
  const bodyId = useId();
  const editedId = useId();
  const noteId = useId();
  const placementId = useId();
  const pageId = useId();
  const breakpointId = useId();
  const pendingId = useId();
  const summaryId = useId();
  const priorityId = useId();
  const threads = useCommentThreads();
  const replies = threads?.repliesOf(comment.id) ?? NO_REPLIES;
  // The thread and its box show in one place at a time: the popover, while it's open.
  const threadHere = selected && !threadInPopover;
  const summary = threads && !threadHere ? threadSummary(replies, now) : null;
  const boxHere = threads !== null && showsReplyBox(threads, comment);
  // The card's resolved note already says there's no replying (`RESOLVED_NOTE`).
  const closedNote = threads && !resolvedNote ? replyClosedNote(threads.viewer, comment) : null;
  // Everyone gets a reply box here, or (a guest who can't reply) the reason there's none; the
  // guest's own resolved comment with no replies has neither, and no thread's rule over nothing.
  const showThread =
    threads !== null &&
    threadHere &&
    !editing &&
    (replies.length > 0 || boxHere || closedNote !== null);
  /**
   * The reply box shows, rather than its Reply button: once there's a thread, a draft, or the
   * button was pressed. It then stays while the card is selected (deleting the last reply, or
   * leaving the box, never folds it back under focus); deselected, the button comes back.
   */
  const [replyOpen, setReplyOpen] = useState(false);
  const [wasSelected, setWasSelected] = useState(selected);
  if (wasSelected !== selected) {
    setWasSelected(selected);
    if (!selected) setReplyOpen(false);
  }
  const draft = threads?.draftOf(comment.id) ?? "";
  if (threadHere && !replyOpen && (replies.length > 0 || draft !== "")) setReplyOpen(true);
  const shotPending = !comment.crop && isScreenshotPending(comment);
  const described = [
    bodyId,
    comment.editedAt ? editedId : null,
    resolvedNote ? noteId : null,
    comment.priority ? priorityId : null,
    pageNumber ? pageId : null,
    breakpoint ? breakpointId : null,
    placement ? placementId : null,
    shotPending ? pendingId : null,
    summary ? summaryId : null,
  ]
    .filter(Boolean)
    .join(" ");
  const resolved = comment.status === "resolved";
  const actions = canModerate || canEdit || Boolean(onGetInfo) || Boolean(onCopyLink);
  const summaryShown = summary !== null && !editing;
  // Without the action row (no action to offer), this keeps the card's bottom inset at 16px. The summary
  // line (12px under it) and the thread (16px) bring their own, as on the team's cards.
  const bottomInset = actions || summaryShown || showThread ? "" : "pb-2";

  const startEditing = () => {
    setEditing(true);
    onEditing?.(comment, true);
  };

  /** Focus is owed to the card's own button once its text is back (`focusOnReturn`). */
  const refocus = useRef(false);

  /**
   * Closing the editor hands focus back to the Edit button (or, once there's
   * none, the card) instead of dropping it to the page.
   */
  const finishEditing = () => {
    setEditing(false);
    setSave(SAVE_IDLE);
    onEditing?.(comment, false);
    refocus.current = true;
    requestAnimationFrame(() => {
      const trigger = itemRef.current?.querySelector<HTMLElement>("[data-edit-trigger]");
      // No Edit any more (the window closed meanwhile): the card's button isn't back yet,
      // as the text waits for the editor's exit, so `focusOnReturn` takes it then.
      if (!trigger) return;
      refocus.current = false;
      trigger.focus();
    });
  };

  const focusOnReturn = (node: HTMLButtonElement | null) => {
    if (!node || !refocus.current) return;
    refocus.current = false;
    // Only if focus fell to the page: a card leaving the tab has already sent it elsewhere.
    const active = document.activeElement;
    if (!active || active === document.body) node.focus();
  };

  const saveEdit = async (body: string) => {
    const saving = onEdit(comment.id, body);
    if (!saving) {
      finishEditing();
      return;
    }
    setSave({ pending: true, error: null });
    const outcome = await saving;
    if (outcome.ok) finishEditing();
    else setSave({ pending: false, error: { error: outcome.error, final: outcome.final } });
  };

  return (
    // `initial`/`animate` come from the list, so cards stagger in on mount.
    <motion.li
      ref={itemRef}
      layout={reduce ? false : "position"}
      variants={variants}
      exit="exit"
      data-testid="comment-card"
      data-comment-id={comment.id}
      // One color for the card and its avatar's badge ring (`--avatar-surface`): the card at
      // rest; on hover, the 60% hover tint over the panel, made opaque so the ring can match it;
      // the hover color when pressed. The list always sits on the panel.
      className={`relative rounded-tile bg-(--avatar-surface) transition-colors [--avatar-surface:var(--color-card)] has-[[data-card-select]:hover]:[--avatar-surface:color-mix(in_srgb,var(--color-hover)_60%,var(--color-panel))] has-[[data-card-select]:active]:[--avatar-surface:var(--color-hover)] has-[[data-card-select]:focus-visible]:ring-2 has-[[data-card-select]:focus-visible]:ring-focus ${bottomInset}`}
    >
      {selected ? (
        <motion.span
          layoutId="comment-selection"
          transition={reduce ? instant : spring.snappy}
          // brand-text, not brand: cobalt is only 2.5:1 on dark cards, the dark-theme variant 7.8:1.
          className="pointer-events-none absolute inset-0 rounded-tile ring-2 ring-brand-text"
        />
      ) : null}

      {/* The text and the editor swap in place; the card's `layout` takes up the height change. */}
      <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.div key="editor" variants={swap} initial="hidden" animate="visible" exit="exit">
            <CommentEditor
              initialBody={comment.body}
              pending={save.pending}
              error={save.error}
              emptyMessage={canModerate ? undefined : EMPTY_CLIENT_EDIT}
              onCancel={finishEditing}
              onSave={(body) => void saveEdit(body)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="text"
            variants={swap}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="p-4 pb-2"
          >
            {/*
             * The button's name is its visible header ("Comment 1 by Ana, 2m ago"), so the
             * spoken name matches what's on screen (WCAG 2.5.3). Its ::after stretches over the
             * whole card, so the comment text below stays clickable; it's read as the description.
             * The header matches the pin's popover: the name (and Client chip) over the time, in
             * one column beside the avatar. Spans only, since a button holds phrasing content.
             */}
            <button
              ref={focusOnReturn}
              type="button"
              data-card-select
              aria-pressed={selected}
              aria-describedby={described}
              onClick={() => onSelect(comment.id)}
              className="flex w-full items-center gap-2 text-left after:absolute after:inset-0 after:rounded-tile focus-visible:outline-none"
            >
              <CommentBadge comment={comment} number={number} />
              <CommentAuthorAvatar comment={comment} surface="card" />
              <span className="flex min-w-0 flex-1 flex-col">
                {/* As tall as the Client pin, so cards match with or without it. */}
                <span className="flex min-h-6 min-w-0 items-center gap-2 text-body font-semibold">
                  {/* One line, not the popover's two: the list is scanned, and the card has the room. */}
                  <span className="min-w-0 truncate">
                    <span className="sr-only">by </span>
                    {comment.author}
                    <CommentTeamNote comment={comment} />
                  </span>
                  <ClientMark comment={comment} owner={canModerate} />
                </span>
                <time
                  dateTime={new Date(comment.createdAt).toISOString()}
                  title={absoluteTime(comment.createdAt)}
                  className="text-label text-muted"
                >
                  <span className="sr-only">, </span>
                  {relativeTime(comment.createdAt, now)}
                </time>
              </span>
            </button>
            <p id={bodyId} className="mt-2 text-body break-words whitespace-pre-wrap text-ink-2">
              {comment.body}
            </p>
            <CommentEdited id={editedId} editedAt={comment.editedAt} now={now} className="mt-1" />
            {resolvedNote ? (
              <p
                id={noteId}
                data-testid="comment-resolved-note"
                className="mt-1 text-label text-muted"
              >
                {RESOLVED_NOTE}
              </p>
            ) : null}
            {/* Beside the page or breakpoint chip that may follow, on one line while they fit. */}
            <PriorityChip id={priorityId} priority={comment.priority} className="mt-2 mr-2" />
            {pageNumber ? (
              <p
                id={pageId}
                data-testid="comment-page"
                // Same chip as PlacementChip's (8px gap, 12px by 4px padding), on the 4px grid.
                className="mt-2 inline-flex items-center gap-2 rounded-pill bg-seg px-3 py-1 text-label font-semibold text-ink-2"
              >
                <Icon name="image" className="size-3.5" />
                Page {pageNumber}
              </p>
            ) : null}
            {breakpoint ? (
              <p
                id={breakpointId}
                data-testid="comment-breakpoint"
                // The page chip's twin: websites never have several pages, so they never meet.
                className="mt-2 inline-flex items-center gap-2 rounded-pill bg-seg px-3 py-1 text-label font-semibold text-ink-2"
              >
                <Icon name={BREAKPOINT_ICON[breakpoint]} className="size-3.5" />
                {BREAKPOINT_LABEL[breakpoint]}
              </p>
            ) : null}
            {placement ? <PlacementChip id={placementId} placement={placement} now={now} /> : null}
          </motion.div>
        )}
      </AnimatePresence>

      {editing ? null : comment.crop ? (
        <CommentCropThumb crop={comment.crop} pin={cropPin} number={number} />
      ) : shotPending ? (
        <ScreenshotPending id={pendingId} />
      ) : null}

      {editing || !actions ? null : (
        // `relative` lifts the actions above the select button's card-wide ::after.
        <div className="relative flex items-center gap-1 px-2 pb-2">
          {!canModerate ? null : resolved ? (
            <Button variant="secondary" size="sm" onClick={() => onReopen(comment.id)}>
              <Icon name="undo" className="size-4" />
              Reopen
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => onResolve(comment.id)}>
              <Icon name="check" className="size-4" />
              Resolve
            </Button>
          )}
          {canEdit ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={startEditing}
              aria-label={`Edit comment ${number}`}
              data-edit-trigger
            >
              <Icon name="pencil" className="size-4" />
              Edit
            </Button>
          ) : null}
          {onCopyLink ? (
            <CommentMoreMenu
              number={number}
              onCopyLink={() => onCopyLink(comment)}
              priority={comment.priority ?? null}
              onSetPriority={
                onSetPriority ? (priority) => onSetPriority(comment, priority) : undefined
              }
              onGetInfo={onGetInfo ? () => onGetInfo(comment) : undefined}
            />
          ) : null}
          {canDelete ? (
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto text-muted hover:text-danger"
              onClick={() => onDelete(comment)}
              aria-label={`Delete comment ${number}`}
              title="Delete"
            >
              <Icon name="trash" className="size-4" />
            </Button>
          ) : null}
        </div>
      )}

      {/* `relative` lifts the thread above the select button's card-wide ::after, as the actions. */}
      <AnimatePresence initial={false}>
        {showThread && threads ? (
          <motion.div
            key="thread"
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            data-thread-scope
            className="relative mx-4 flex flex-col gap-3 border-t border-line pt-3 pb-4"
          >
            <CommentThread
              replies={replies}
              number={number}
              threads={threads}
              surface="card"
              now={now}
            />
            <ReplySlot
              box={
                boxHere ? (
                  <CardReplyBox
                    open={replyOpen || replies.length > 0 || draft !== ""}
                    onOpen={() => setReplyOpen(true)}
                    authorName={threads.authorName}
                    onSend={(reply) => threads.send(comment, reply)}
                    initialBody={draft}
                    onDraftChange={(body) => threads.keepDraft(comment.id, body)}
                  />
                ) : null
              }
              note={closedNote}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      {summaryShown && summary ? <ThreadSummaryLine id={summaryId} summary={summary} /> : null}
    </motion.li>
  );
}
