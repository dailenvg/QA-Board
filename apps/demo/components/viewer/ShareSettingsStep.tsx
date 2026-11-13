"use client";

import type { ReviewWindowChoice } from "@/lib/share/review-window";
import type { Result } from "@/lib/store/store";
import type { ProjectShare } from "@/lib/store/types";
import { useNow } from "@/lib/use-now";
import { ReviewWindowControl } from "./ReviewWindowControl";
import { reviewWindowSummary } from "./review-window-summary";
import { SharePasswordControl } from "./SharePasswordControl";
import { ShareStep } from "./ShareStep";

interface ShareSettingsStepProps {
  step: number | null;
  share: ProjectShare;
  reviewWindow: ReviewWindowChoice;
  savingWindow: boolean;
  windowError: string | null;
  onReviewWindowChange: (choice: ReviewWindowChoice) => void;
  onPasswordChange: (password: string | null) => Promise<Result>;
  /** The link is on its way out: nothing can change. */
  revoking: boolean;
}

/** Step 2: the link's settings, as rows: its review window, and its password. */
export function ShareSettingsStep({
  step,
  share,
  reviewWindow,
  savingWindow,
  windowError,
  onReviewWindowChange,
  onPasswordChange,
  revoking,
}: ShareSettingsStepProps) {
  const now = useNow();
  return (
    <ShareStep step={step} title="Settings" testId="share-settings-step">
      <ReviewWindowControl
        value={reviewWindow}
        onChange={onReviewWindowChange}
        summary={
          <span data-testid="review-window">{reviewWindowSummary(share.reviewEndsAt, now)}</span>
        }
        saving={savingWindow}
        error={windowError}
        disabled={revoking}
        layoutId="share-review-window-thumb"
      />
      <SharePasswordControl
        passwordSetAt={share.passwordSetAt}
        onChange={onPasswordChange}
        disabled={revoking}
      />
    </ShareStep>
  );
}
