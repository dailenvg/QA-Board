"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { duration, staggerGroup } from "@/lib/motion";
import type { Reply } from "@/lib/store/types";
import type { AvatarSurface } from "../ui/PersonAvatar";
import type { CommentThreads } from "./comment-threads";
import { canReply, replyRights } from "./reply-rights";
import { REPLY_MORE, ReplyItem } from "./ReplyItem";

/**
 * What holds a thread and its reply box (a card, the pin's popover): marked
 * `data-thread-scope`, so focus finds the box once the last reply is gone.
 */
const THREAD_SCOPE = "[data-thread-scope]";

/** Replies stagger in; the list fades out with the last one. */
const listVariants = {
  ...staggerGroup(),
  exit: { opacity: 0, transition: { duration: duration.micro } },
};

interface CommentThreadProps {
  /** The comment's replies, oldest first. */
  replies: readonly Reply[];
  /** The comment's pin number, for the list's name. */
  number: number;
  threads: CommentThreads;
  /** What the thread sits on, for the avatars' badge ring. */
  surface: AvatarSurface;
  now: number;
  /** For the list, such as a rule above it in the pin's popover. */
  className?: string;
}

/**
 * Focus for a reply that's leaving: the next reply's More button, else the
 * one before's, else the reply box. Two frames: after the menu (or the
 * confirm) has handed focus back to the reply that's going.
 */
function focusAfterLeaving(list: HTMLElement | null, replies: readonly Reply[], id: string) {
  const at = replies.findIndex((reply) => reply.id === id);
  const neighbour = at < 0 ? undefined : (replies[at + 1] ?? replies[at - 1]);
  const scope = list?.closest(THREAD_SCOPE);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const more = neighbour
        ? scope?.querySelector<HTMLElement>(
            `[data-reply-id="${CSS.escape(neighbour.id)}"] [data-testid="${REPLY_MORE}"]`,
          )
        : null;
      // The box's own field: another reply's open editor comes first in the scope.
      const box = scope?.querySelector<HTMLElement>('[data-testid="reply-composer"] textarea');
      (more ?? box)?.focus();
    }),
  );
}

/**
 * A comment's replies (U1), oldest first, staggering in on mount; a new one
 * reveals at the end and comes into view. Nothing without replies: the reply
 * box below is enough.
 */
export function CommentThread({
  replies,
  number,
  threads,
  surface,
  now,
  className = "",
}: CommentThreadProps) {
  const reduce = useReducedMotion();
  const listRef = useRef<HTMLOListElement>(null);
  const latest = replies.at(-1);
  const latestId = latest?.id;
  const latestMine = latest?.mine === true;
  const shownLatest = useRef(latestId);
  const replying = canReply(threads.viewer);

  // A reply arriving at the end (one just sent, most often) scrolls into view, for its author or
  // whoever is replying in this thread: one from elsewhere never moves the list or popover being
  // read. A review link's guest only reads (no box), so the team's replies arriving on the 15s
  // refresh never move them, even with focus on the popover itself.
  useEffect(() => {
    if (latestId === shownLatest.current) return;
    shownLatest.current = latestId;
    const list = listRef.current;
    if (!latestId || !list) return;
    const scope = list.closest(THREAD_SCOPE);
    const active = document.activeElement;
    if (!latestMine && !(replying && active && scope?.contains(active))) return;
    const reply = list.querySelector(`[data-reply-id="${CSS.escape(latestId)}"]`);
    // Where the box scrolls with the thread (a card in the list), the box comes into view: the
    // reply sits just above it, so both show, and the field being typed in never ends below the
    // fold. The popover's box is pinned under its scroller, so there the reply does.
    const box = scope?.querySelector('[data-testid="reply-composer"]') ?? null;
    const together =
      box !== null && box.closest("[data-menu-bounds]") === list.closest("[data-menu-bounds]");
    (together ? box : reply)?.scrollIntoView({
      block: "nearest",
      behavior: reduce ? "auto" : "smooth",
    });
  }, [latestId, latestMine, replying, reduce]);

  // Never `initial={false}`: a thread shown on selecting a card staggers in.
  return (
    <AnimatePresence>
      {replies.length > 0 ? (
        <motion.ol
          key="thread"
          ref={listRef}
          variants={listVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          aria-label={`Replies to comment ${number}`}
          data-testid="comment-thread"
          className={`flex flex-col gap-3 ${className}`}
        >
          <AnimatePresence>
            {replies.map((reply) => (
              <ReplyItem
                key={reply.id}
                reply={reply}
                rights={replyRights(reply, threads.viewer)}
                owner={threads.viewer.team}
                surface={surface}
                now={now}
                onEdit={(body) => threads.edit(reply, body)}
                onDelete={() =>
                  threads.remove(reply, () => focusAfterLeaving(listRef.current, replies, reply.id))
                }
                onGetInfo={() => threads.getInfo(reply)}
              />
            ))}
          </AnimatePresence>
        </motion.ol>
      ) : null}
    </AnimatePresence>
  );
}
