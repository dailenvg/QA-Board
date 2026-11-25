"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useRef, useState } from "react";
import { useRevealVariants, useSwapVariants } from "@/lib/motion";
import { absoluteTime, relativeTime } from "@/lib/relative-time";
import type { Reply } from "@/lib/store/types";
import type { AvatarSurface } from "../ui/PersonAvatar";
import { Menu, type MenuItem } from "../ui/Menu";
import { ClientMark } from "./ClientMark";
import { CommentAuthorAvatar } from "./CommentAuthorAvatar";
import { CommentEdited } from "./CommentEdited";
import { CommentEditor } from "./CommentEditor";
import { CommentTeamNote } from "./CommentTeamNote";
import type { ReplyRights } from "./reply-rights";

/** The More button's test id, which focus goes back to once the editor closes. */
export const REPLY_MORE = "reply-more";

const EMPTY_REPLY_EDIT = "A reply can't be empty. Delete it instead.";

interface ReplyItemProps {
  reply: Reply;
  rights: ReplyRights;
  /** The workspace's viewer: marks a client's reply (`ClientMark`). */
  owner: boolean;
  /** What the thread sits on, for the avatar's badge ring. */
  surface: AvatarSurface;
  now: number;
  onEdit: (body: string) => void;
  onDelete: () => void;
  onGetInfo: () => void;
}

/** The reply's More menu items, in order: Edit, Get info, then Delete set apart. */
function replyMenuItems(
  rights: ReplyRights,
  actions: { edit: () => void; getInfo: () => void; remove: () => void },
): MenuItem[] {
  const items: MenuItem[] = [];
  if (rights.edit) {
    items.push({ label: "Edit", icon: "pencil", onSelect: actions.edit, testId: "reply-edit" });
  }
  if (rights.getInfo) {
    items.push({
      label: "Get info",
      icon: "info",
      onSelect: actions.getInfo,
      testId: "reply-get-info",
    });
  }
  if (rights.delete) {
    items.push({
      label: "Delete",
      icon: "trash",
      danger: true,
      separatorBefore: items.length > 0,
      onSelect: actions.remove,
      testId: "reply-delete",
    });
  }
  return items;
}

/**
 * One reply in a thread: who wrote it (their avatar, with the company badge
 * for the team, or the Client chip) and when, its words, and when they were
 * last edited. Its More menu holds what the member may do: Edit their own,
 * Get info, Delete. Editing swaps the words for the editor in place.
 */
export function ReplyItem({
  reply,
  rights,
  owner,
  surface,
  now,
  onEdit,
  onDelete,
  onGetInfo,
}: ReplyItemProps) {
  const [editing, setEditing] = useState(false);
  const reduce = useReducedMotion();
  const reveal = useRevealVariants();
  const swap = useSwapVariants();
  const editedId = useId();
  /** Focus is owed to the More button once the words are back (`focusOnReturn`). */
  const refocus = useRef(false);

  /** Closing the editor hands focus back to the More button, never to the page. */
  const finishEditing = () => {
    setEditing(false);
    refocus.current = true;
  };

  // The words come back only once the editor has left (`mode="wait"`), so focus waits for them.
  const focusOnReturn = (node: HTMLDivElement | null) => {
    if (!node || !refocus.current) return;
    refocus.current = false;
    node.querySelector<HTMLElement>(`[data-testid="${REPLY_MORE}"]`)?.focus();
  };

  const items = replyMenuItems(rights, {
    edit: () => setEditing(true),
    getInfo: onGetInfo,
    remove: onDelete,
  });
  const menu = items.length > 0;

  return (
    // `initial`/`animate` come from the thread, so replies stagger in on mount.
    <motion.li
      layout={reduce ? false : "position"}
      variants={reveal}
      exit="exit"
      data-testid="reply"
      data-reply-id={reply.id}
    >
      <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.div key="editor" variants={swap} initial="hidden" animate="visible" exit="exit">
            <CommentEditor
              initialBody={reply.body}
              label="Edit reply"
              emptyMessage={EMPTY_REPLY_EDIT}
              onCancel={finishEditing}
              onSave={(body) => {
                onEdit(body);
                finishEditing();
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="text"
            ref={focusOnReturn}
            variants={swap}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex gap-2"
          >
            <CommentAuthorAvatar comment={reply} surface={surface} />
            <div className="flex min-w-0 flex-1 flex-col">
              {/*
               * The 44px More button reaches 8px past the row's top and right, so its icon lines up
               * with the name and the words' edge. Without one (a guest), the name keeps the
               * words' width rather than running 8px past them.
               */}
              <div className={`flex items-start gap-2 ${menu ? "-mt-2 -mr-2" : ""}`}>
                <div className={`flex min-w-0 flex-1 flex-col ${menu ? "pt-2" : ""}`}>
                  <p className="flex min-h-6 min-w-0 items-center gap-2 text-body font-semibold">
                    <span className="min-w-0 truncate">
                      {reply.author}
                      <CommentTeamNote comment={reply} />
                    </span>
                    <ClientMark comment={reply} owner={owner} />
                  </p>
                  <time
                    dateTime={new Date(reply.createdAt).toISOString()}
                    title={absoluteTime(reply.createdAt)}
                    className="text-label text-muted"
                  >
                    <span className="sr-only">, </span>
                    {relativeTime(Math.min(reply.createdAt, now || reply.createdAt), now)}
                  </time>
                </div>
                {menu ? (
                  <Menu
                    label={`Actions for reply by ${reply.author}`}
                    items={items}
                    testId={REPLY_MORE}
                    className="shrink-0"
                  />
                ) : null}
              </div>
              <p
                data-testid="reply-body"
                className="mt-1 text-body break-words whitespace-pre-wrap text-ink-2"
              >
                {reply.body}
              </p>
              <CommentEdited id={editedId} editedAt={reply.editedAt} now={now} className="mt-1" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
