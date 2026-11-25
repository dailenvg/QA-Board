"use client";

import { AnimatePresence, motion } from "motion/react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useRevealVariants, useSwapVariants } from "@/lib/motion";

interface ReplySlotProps {
  /** The reply box, where it shows (`showsReplyBox`); null where it doesn't. */
  box: ReactNode;
  /**
   * Why its viewer can't reply here (`replyClosedNote`); null when they can, or to say nothing.
   * Said in the box's place, or above a box kept only for the words in it (`keepsBox`).
   */
  note: string | null;
}

/** Where focus goes in the box: its name field, its reply field, or its Reply button. */
const FIRST_CONTROL = "input, textarea, button";

/**
 * Where a thread's reply box goes, under a card's thread or the pin's
 * popover. A guest who can't reply there reads why instead (the window
 * closed, or the team resolved the comment), and one swaps for the other in
 * place when that changes while it's open. A box kept for its words after the
 * right to reply went says why above it, before Reply is pressed. Whichever leaves with focus in it
 * (an empty field, its Reply button, the note) hands focus to what arrives, so
 * it isn't dropped to the page: the note is read out, the box is typed in.
 */
export function ReplySlot({ box, note }: ReplySlotProps) {
  const swap = useSwapVariants();
  const reveal = useRevealVariants();
  const slotRef = useRef<HTMLDivElement>(null);
  /** What was here left with focus in it: what arrives takes it. */
  const passFocus = useRef(false);
  const hasBox = Boolean(box);
  const hasNote = note !== null;
  const shownBox = useRef(hasBox);

  // On a swap only (never on mounting, when a box can take focus itself), before the leaving
  // one's exit removes it, while focus can still be found inside; and only if something arrives.
  useLayoutEffect(() => {
    if (shownBox.current === hasBox) return;
    shownBox.current = hasBox;
    const active = document.activeElement;
    const inside = Boolean(active && slotRef.current?.contains(active));
    passFocus.current = (hasBox || hasNote) && inside;
  }, [hasBox, hasNote]);

  /** Gives `target`, in what just arrived, the focus owed (`passFocus`). */
  const takeFocus = (target: HTMLElement | null | undefined) => {
    if (!target || !passFocus.current) return;
    const active = document.activeElement;
    const dropped = !active || active === document.body;
    // Still in the one leaving: what arrives takes it once that's gone.
    if (!dropped && slotRef.current?.contains(active)) return;
    passFocus.current = false;
    // Only if focus fell to the page: a Tab during the exit has already moved it on.
    if (dropped) target.focus({ preventScroll: true });
  };

  return (
    // `empty:hidden`: with neither box nor note, the thread's gap doesn't leave space for one.
    <div ref={slotRef} className="empty:hidden">
      <AnimatePresence mode="wait" initial={false}>
        {box ? (
          <motion.div
            key="box"
            ref={(node) => {
              takeFocus(node?.querySelector<HTMLElement>(FIRST_CONTROL));
            }}
            variants={swap}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <AnimatePresence initial={false}>
              {note ? (
                <motion.p
                  key="kept-note"
                  variants={reveal}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  data-testid="reply-closed-note"
                  className="mb-2 text-label text-muted"
                >
                  {note}
                </motion.p>
              ) : null}
            </AnimatePresence>
            {box}
          </motion.div>
        ) : note ? (
          <motion.p
            key="note"
            ref={(node) => {
              takeFocus(node);
            }}
            tabIndex={-1}
            variants={swap}
            initial="hidden"
            animate="visible"
            exit="exit"
            data-testid="reply-closed-note"
            className="text-label text-muted focus:outline-none"
          >
            {note}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
