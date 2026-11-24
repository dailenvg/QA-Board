"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useSwapVariants } from "@/lib/motion";
import type { Result } from "@/lib/store/store";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import type { ReplyDraft } from "./comment-threads";
import { ReplyComposer } from "./ReplyComposer";

interface CardReplyBoxProps {
  /** The box shows; otherwise a Reply button stands in for it until pressed. */
  open: boolean;
  onOpen: () => void;
  authorName: string | null;
  initialBody: string;
  onSend: (draft: ReplyDraft) => Promise<Result<unknown>>;
  onDraftChange: (body: string) => void;
}

/**
 * A selected card's reply box. Under a comment nobody has replied to, a Reply
 * button stands in for it, so a fresh comment isn't followed by an empty
 * field; pressing it swaps in the box with focus in it. The card decides when
 * it's `open` (a thread, a draft, or the button pressed while selected).
 */
export function CardReplyBox({
  open,
  onOpen,
  authorName,
  initialBody,
  onSend,
  onDraftChange,
}: CardReplyBoxProps) {
  const swap = useSwapVariants();
  /** Opened from the button: the box takes focus as it arrives, never otherwise. */
  const [pressed, setPressed] = useState(false);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {open ? (
        <motion.div key="box" variants={swap} initial="hidden" animate="visible" exit="exit">
          <ReplyComposer
            authorName={authorName}
            onSend={onSend}
            initialBody={initialBody}
            onDraftChange={onDraftChange}
            autoFocus={pressed}
          />
        </motion.div>
      ) : (
        <motion.div key="button" variants={swap} initial="hidden" animate="visible" exit="exit">
          <Button
            variant="ghost"
            size="sm"
            data-testid="reply-start"
            onClick={() => {
              setPressed(true);
              onOpen();
            }}
          >
            <Icon name="reply" className="size-4" />
            Reply
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
