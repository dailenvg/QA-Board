"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { useIconSwapVariants } from "@/lib/motion";
import { useTimedFlag } from "@/lib/use-timed-flag";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

/** How long the tick shows after a copy. */
const TICK_MS = 1500;

interface CopyLinkButtonProps {
  /** The comment's pin number, for the button's name. */
  number: number;
  /** Copies the comment's link (`copyCommentLink`); resolves true once the clipboard has it. */
  onCopy: () => Promise<boolean>;
  testId?: string;
}

/**
 * A comment's Copy link icon button (the pin popover's header, a guest's
 * card). After a copy its link icon turns to a tick for a moment; a second
 * copy restarts it, a failed one shows none. Its name stays as it is: the
 * toast says it was copied.
 */
export function CopyLinkButton({ number, onCopy, testId }: CopyLinkButtonProps) {
  const [copied, tick] = useTimedFlag(TICK_MS);
  const variants = useIconSwapVariants();
  /** The copy resolves after the click: a button gone by then shows nothing (and starts no timer). */
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const copy = () => {
    void onCopy().then((ok) => {
      if (ok && mounted.current) tick();
    });
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Copy link to comment ${number}`}
      title="Copy link"
      className="text-muted hover:text-ink"
      onClick={copy}
      data-copied={copied ? "true" : undefined}
      data-testid={testId}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={copied ? "check" : "link"}
          variants={variants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="flex"
        >
          <Icon name={copied ? "check" : "link"} className="size-4" />
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}
