"use client";

import { useId } from "react";
import {
  REVIEW_WINDOW_LABELS,
  REVIEW_WINDOWS,
  type ReviewWindowChoice,
} from "@/lib/share/review-window";
import { FieldError } from "../ui/FieldError";
import { SegmentedControl, type SegmentOption } from "../ui/SegmentedControl";

interface ReviewWindowControlProps {
  value: ReviewWindowChoice;
  onChange: (choice: ReviewWindowChoice) => void;
  /** A change is on its way to the server. */
  saving: boolean;
  /** Why the last change didn't save (it was undone); null when it did. */
  error: string | null;
  /**
   * The link is being created or revoked, so a change now would be lost or
   * sent to a link on its way out. The choices stay visible, dimmed.
   */
  disabled?: boolean;
  /** Id of the text under the control that says what the choice means now (time left). */
  describedBy?: string;
}

const LABEL = "How long clients can comment";

/**
 * Phones get short names for the timed windows, so all four fit on one line
 * down to a 320px screen. Screen readers always get the full label.
 */
const SHORT_LABELS: Partial<Record<ReviewWindowChoice, string>> = {
  "24h": "24h",
  "72h": "72h",
  "7d": "7d",
};

const OPTIONS: ReadonlyArray<SegmentOption<ReviewWindowChoice>> = REVIEW_WINDOWS.map((value) => {
  const shortLabel = SHORT_LABELS[value];
  return {
    value,
    label: REVIEW_WINDOW_LABELS[value],
    testId: `review-window-${value}`,
    ...(shortLabel ? { shortLabel } : {}),
  };
});

const DISABLED_OPTIONS = OPTIONS.map((option) => ({ ...option, disabled: true }));

/**
 * The review window of a link, before it's created and after: four choices,
 * always counted from when the link was created. Saving is said in words
 * beside the label; a change that didn't save says why under the control
 * (announced as an alert, and read again with the group).
 */
export function ReviewWindowControl({
  value,
  onChange,
  saving,
  error,
  disabled = false,
  describedBy,
}: ReviewWindowControlProps) {
  const errorId = useId();
  const description = [error ? errorId : null, describedBy ?? null].filter(Boolean).join(" ");
  return (
    // No gap: the error brings its own 8px above it, so it sits as close as the label does.
    <div className="flex w-full flex-col">
      {/* Same size and spacing as the Share link field's label above it. */}
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-body font-semibold text-ink">{LABEL}</p>
        <p
          role="status"
          className="shrink-0 text-meta text-muted"
          data-testid="review-window-saving"
        >
          {saving ? "Saving…" : ""}
        </p>
      </div>
      <SegmentedControl
        label={LABEL}
        describedBy={description}
        layoutId="share-review-window-thumb"
        stretch
        value={value}
        onChange={onChange}
        options={disabled ? DISABLED_OPTIONS : OPTIONS}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}
