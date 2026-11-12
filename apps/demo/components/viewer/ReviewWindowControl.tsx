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
}

const LABEL = "How long clients can comment";

/** Phones get the hour windows' short names, so all four fit on one line. */
const SHORT_LABELS: Partial<Record<ReviewWindowChoice, string>> = { "24h": "24h", "72h": "72h" };

const OPTIONS: ReadonlyArray<SegmentOption<ReviewWindowChoice>> = REVIEW_WINDOWS.map((value) => {
  const shortLabel = SHORT_LABELS[value];
  return {
    value,
    label: REVIEW_WINDOW_LABELS[value],
    testId: `review-window-${value}`,
    ...(shortLabel ? { shortLabel } : {}),
  };
});

/**
 * The review window of a link, before it's created and after: four choices,
 * always counted from when the link was created. Saving is said in words
 * beside the label; a change that didn't save says why under the control
 * (announced as an alert).
 */
export function ReviewWindowControl({ value, onChange, saving, error }: ReviewWindowControlProps) {
  const errorId = useId();
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-meta font-semibold text-ink">{LABEL}</p>
        <p role="status" className="text-meta text-muted" data-testid="review-window-saving">
          {saving ? "Saving…" : ""}
        </p>
      </div>
      <SegmentedControl
        label={LABEL}
        layoutId="share-review-window-thumb"
        stretch
        value={value}
        onChange={onChange}
        options={OPTIONS}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}
