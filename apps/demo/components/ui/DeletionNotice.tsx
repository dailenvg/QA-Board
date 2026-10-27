"use client";

import { motion } from "motion/react";
import { useRevealVariants } from "@/lib/motion";
import { Button } from "./Button";
import type { DeletionWhen } from "./deletion-when";
import { Icon } from "./Icon";

/** Copy for the notice's controls (Writer: the date wording is in deletion-when.ts). */
const COPY = {
  exportLabel: "Export",
  /** Contains the visible "Export" (WCAG 2.5.3) and says what it exports. */
  exportName: "Export comments",
  regionLabel: "Deletion notice",
} as const;

const stateOf = (when: DeletionWhen) =>
  when.overdue ? "overdue" : when.urgent ? "last-day" : "upcoming";

interface DeletionNoticeProps {
  when: DeletionWhen;
  /** Why it goes and what that means here. Hidden on phones, where the headline has to carry it. */
  explanation: string;
  /** Opens the existing export flow. Omit it where there's nothing to export. */
  onExport?: (opener: HTMLElement) => void;
}

/**
 * A slim bar under the viewer's top bar: when this project is deleted, and
 * (for the owner) a way to export it first. Neutral, so it doesn't compete with
 * the review countdown; the last day tints it like the countdown's last day.
 * Not a live region: it's there on arrival, and ticking it would be noise.
 */
export function DeletionNotice({ when, explanation, onExport }: DeletionNoticeProps) {
  const variants = useRevealVariants();
  return (
    // An opaque base under the tint, so the warning text keeps AA on any page background.
    <motion.section
      aria-label={COPY.regionLabel}
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      data-testid="deletion-notice"
      data-state={stateOf(when)}
      className="shrink-0 rounded-panel bg-panel"
    >
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-panel p-2 pl-4 transition-colors duration-150 ${
          when.urgent ? "bg-comments-soft" : ""
        }`}
      >
        <Icon
          name="clock"
          className={`size-4 shrink-0 ${when.urgent ? "text-comments-text" : "text-ink-2"}`}
        />
        <p className="min-w-0 flex-1 py-1 text-body text-muted">
          <time
            dateTime={when.iso}
            title={when.full}
            className={`font-semibold ${when.urgent ? "text-comments-text" : "text-ink"}`}
          >
            {when.headline}
          </time>
          {when.detail ? (
            <>
              <span aria-hidden="true" className="tabular-nums">
                {" · "}
                {when.detail}
              </span>
              <span className="sr-only">, {when.spokenDetail}.</span>
            </>
          ) : (
            <span className="sr-only">.</span>
          )}
          <span className="max-sm:hidden"> {explanation}</span>
        </p>
        {onExport ? (
          <Button
            variant="secondary"
            size="sm"
            aria-label={COPY.exportName}
            onClick={(event) => onExport(event.currentTarget)}
            data-testid="deletion-export"
          >
            <Icon name="download" className="size-4" />
            {COPY.exportLabel}
          </Button>
        ) : null}
      </div>
    </motion.section>
  );
}

/** Pill tones: neutral until the last day, then the review countdown's warning tint. */
const PILL_TONE = {
  upcoming: "bg-card text-ink",
  urgent: "bg-comments-soft text-comments-text",
} as const;

/** Compact "Deletes Nov 3" for project cards; the full date and time is its tooltip. */
export function DeletionPill({ when }: { when: DeletionWhen }) {
  return (
    <span
      data-testid="deletion-pill"
      data-state={stateOf(when)}
      title={when.full}
      className={`inline-flex shrink-0 items-center gap-2 rounded-pill px-3 py-1 text-label font-semibold whitespace-nowrap ${
        when.urgent ? PILL_TONE.urgent : PILL_TONE.upcoming
      }`}
    >
      {/* Same icon and size as the review countdown chip this mirrors. */}
      <Icon name="clock" className="size-4" />
      {when.short}
    </span>
  );
}
