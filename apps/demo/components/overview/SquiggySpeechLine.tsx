"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRevealVariants } from "@/lib/motion";
import { ACCOUNT_STORAGE_HREF, folderHref } from "@/lib/routes";
import { shortProjectName, type ReactionSpeech, type SquiggySpeech } from "@/lib/squiggy/speech";

interface SquiggySpeechLineProps {
  /** What Squiggy has to say, or null to show `fallback`. */
  speech: SquiggySpeech | null;
  /** The hero's usual subline, for when Squiggy has nothing specific to say. */
  fallback: string;
}

const LINE = "max-w-xl text-nav text-balance";

/**
 * Squiggy's line sits in a small speech bubble, so it reads as Squiggy talking
 * rather than as product copy. From `sm` up Squiggy sits to the left and a tail
 * points at it; stacked on phones it sits above, so there's no tail.
 * The tail is the bubble's own colour (`bg-inherit`), hover included.
 */
const BUBBLE = `relative block rounded-card bg-card px-4 shadow-seg sm:before:absolute sm:before:top-1/2 sm:before:-left-1 sm:before:size-4 sm:before:-translate-y-1/2 sm:before:rotate-45 sm:before:rounded-kbd sm:before:bg-inherit ${LINE}`;

/** A bubble that's a link: underlined in brand text, with hover and press states. */
const LINK_BUBBLE =
  "py-3 font-semibold text-brand-text underline decoration-brand-text/40 underline-offset-4 transition-colors hover:bg-hover hover:decoration-current active:bg-seg";

function waitingLabel(active: number, folderName: string, total: number): string {
  const line = `${active} ${active === 1 ? "comment" : "comments"} waiting in ${folderName}`;
  return total > active ? `${line} (${total} across all folders)` : line;
}

function storageLabel(level: "near" | "over", percent: number): string {
  return level === "over"
    ? "Storage is full, so new uploads are paused. Free up some space."
    : `Storage is ${percent}% full. Free up some space before it runs out.`;
}

function reactionLine(speech: ReactionSpeech): string {
  switch (speech.kind) {
    case "signed-in":
      return speech.first ? "Hi there. Glad you're here." : "Welcome back.";
    case "just-resolved":
      return "One down. Nice.";
    case "just-created":
      return speech.projectName
        ? `${shortProjectName(speech.projectName)} is in and ready to review.`
        : "Your new project is in and ready to review.";
    case "just-deleted":
      return speech.undoable ? "Gone. You can still undo it." : "Gone. That one can't be undone.";
    case "just-archived":
      return "Archived. It's tucked away until you need it.";
    case "save-failed":
      return "That didn't save. Check your connection and try again.";
    case "just-imported":
      return speech.partial
        ? "Most of it moved in. A few items need another look."
        : "All moved in.";
  }
}

/** Changes whenever the line does, so AnimatePresence swaps it. */
function speechKey(speech: SquiggySpeech | null): string {
  if (!speech) return "fallback";
  switch (speech.kind) {
    case "storage":
      return `storage:${speech.level}:${speech.percent}`;
    case "waiting":
      return `waiting:${speech.folder.id}:${speech.folder.active}:${speech.total}`;
    case "just-created":
      return `just-created:${speech.projectName}`;
    case "just-deleted":
      return `just-deleted:${speech.undoable}`;
    case "just-imported":
      return `just-imported:${speech.partial}`;
    default:
      return speech.kind;
  }
}

/**
 * The hero's subline: for a moment after an event, Squiggy's reaction to it;
 * otherwise Squiggy's line about the workspace when it has something specific
 * to say (comments waiting, or all resolved), else the usual subline. Plain
 * text, not a live region: the toasts already announce each event, and the
 * counts change as people work elsewhere.
 *
 * The usual subline also sits, invisible, in the same grid cell, so swapping
 * between it and Squiggy's line never moves the button below. A waiting or
 * storage line is a link, and the whole bubble (at least 44px tall) is its tap target.
 */
export function SquiggySpeechLine({ speech, fallback }: SquiggySpeechLineProps) {
  const variants = useRevealVariants();
  const key = speechKey(speech);

  return (
    <div className="grid justify-items-center sm:justify-items-start">
      {/* Sizer: as tall as the usual subline in a bubble (one-line link bubbles fit in it). */}
      <p aria-hidden="true" className={`invisible col-start-1 row-start-1 py-3 ${LINE}`}>
        {fallback}
      </p>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={key}
          variants={variants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="col-start-1 row-start-1 self-center"
          data-testid={speech ? "squiggy-speech" : undefined}
          data-kind={speech?.kind}
        >
          {speech?.kind === "waiting" ? (
            // py-3: a one-line bubble is 44px tall, the whole of it the tap target.
            <Link href={folderHref(speech.folder.id)} className={`${BUBBLE} ${LINK_BUBBLE}`}>
              {waitingLabel(speech.folder.active, speech.folder.name, speech.total)}
            </Link>
          ) : speech?.kind === "storage" ? (
            <Link href={ACCOUNT_STORAGE_HREF} className={`${BUBBLE} ${LINK_BUBBLE}`}>
              {storageLabel(speech.level, speech.percent)}
            </Link>
          ) : speech?.kind === "resolved" ? (
            <p className={`${BUBBLE} py-2 text-ink-2`}>All caught up. Every comment is resolved.</p>
          ) : speech ? (
            <p className={`${BUBBLE} py-2 text-ink-2`}>{reactionLine(speech)}</p>
          ) : (
            <p className={`${LINE} text-muted`}>{fallback}</p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
