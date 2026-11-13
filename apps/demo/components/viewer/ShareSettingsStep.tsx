"use client";

import type { ReviewWindowChoice } from "@/lib/share/review-window";
import type { Result } from "@/lib/store/store";
import type { ProjectShare } from "@/lib/store/types";
import { useEffect, useRef } from "react";
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
  /**
   * Focus the review window's selected choice as soon as it's on screen ("Go to settings"):
   * at once where the step is already showing, or when a phone's Settings tab has mounted it.
   */
  focusWindow: boolean;
  /** The focus asked for by `focusWindow` has been given. */
  onWindowFocused: () => void;
}

const SELECTED_WINDOW = '[role="radiogroup"] [role="radio"][tabindex="0"]';

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
  focusWindow,
  onWindowFocused,
}: ShareSettingsStepProps) {
  const now = useNow();
  const root = useRef<HTMLDivElement>(null);

  // Runs on mount too, so a phone's Settings tab takes focus once its panel exists, after the
  // Invite tab's exit, with or without reduced motion.
  useEffect(() => {
    if (!focusWindow) return;
    root.current?.querySelector<HTMLElement>(SELECTED_WINDOW)?.focus();
    onWindowFocused();
  }, [focusWindow, onWindowFocused]);

  return (
    // display: contents: only a handle for finding the selected choice; the step lays out as before.
    <div ref={root} className="contents">
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
    </div>
  );
}
