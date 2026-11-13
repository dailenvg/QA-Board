"use client";

import { useId, type ReactNode } from "react";
import {
  REVIEW_WINDOW_LABELS,
  REVIEW_WINDOWS,
  type ReviewWindowChoice,
} from "@/lib/share/review-window";
import { FieldError } from "../ui/FieldError";
import { SegmentedControl, type SegmentOption } from "../ui/SegmentedControl";
import { ShareSettingRow } from "./ShareSettingRow";

interface ReviewWindowControlProps {
  value: ReviewWindowChoice;
  onChange: (choice: ReviewWindowChoice) => void;
  /** What the choice means now: "Open until …", or when it starts. */
  summary: ReactNode;
  /** A change is on its way to the server. */
  saving: boolean;
  /** Why the last change didn't save (it was undone); null when it did. */
  error: string | null;
  /**
   * The link is being created or revoked, so a change now would be lost or
   * sent to a link on its way out. The choices stay visible, dimmed.
   */
  disabled?: boolean;
}

const LABEL = "How long clients can comment";

/**
 * Phones get short names for the timed windows, so all four fit on one line
 * down to a 320px screen. Screen readers always get the full label.
 */
const SHORT_LABELS: Partial<Record<ReviewWindowChoice, string>> = {
  "24h": "24h",
  "72h": "3d",
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
 * The review window of a link, before it's created and after, as a settings
 * row: four choices, always counted from when the link was created, and what
 * the choice means now under its name. Saving is said in words beside it; a
 * change that didn't save says why under the choices (announced as an alert,
 * and read again with the group).
 */
export function ReviewWindowControl({
  value,
  onChange,
  summary,
  saving,
  error,
  disabled = false,
}: ReviewWindowControlProps) {
  const titleId = useId();
  const summaryId = useId();
  const errorId = useId();
  return (
    <ShareSettingRow
      icon="clock"
      titleId={titleId}
      title="Review window"
      summary={summary}
      summaryId={summaryId}
      testId="review-window-row"
      aside={
        <p
          role="status"
          className="shrink-0 text-meta text-muted"
          data-testid="review-window-saving"
        >
          {saving ? "Saving…" : ""}
        </p>
      }
    >
      <div className="flex flex-col">
        <SegmentedControl
          label={LABEL}
          describedBy={[error ? errorId : null, summaryId].filter(Boolean).join(" ")}
          layoutId="share-review-window-thumb"
          stretch
          value={value}
          onChange={onChange}
          options={disabled ? DISABLED_OPTIONS : OPTIONS}
        />
        <FieldError id={errorId} message={error} />
      </div>
    </ShareSettingRow>
  );
}
