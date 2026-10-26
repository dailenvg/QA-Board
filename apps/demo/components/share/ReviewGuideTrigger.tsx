"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ReviewGuide } from "./ReviewGuide";

/** Set once the guide has opened by itself in this browser, for every shared link. */
const SEEN_KEY = "squint:review-guide-seen";

function seenBefore(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // Storage blocked: show it, as on a first visit.
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Not remembered; it opens again next visit.
  }
}

interface ReviewGuideTriggerProps {
  /** The review window had closed on arrival: the guide's steps no longer apply, so it waits. */
  reviewClosed: boolean;
}

/**
 * The shared review's "How it works" button and guide. The guide opens by
 * itself on a client's first visit in this browser (unless the review window
 * has closed, which doesn't count as that visit), and from the button any
 * time. Render it on the client only: it reads localStorage on mount.
 */
export function ReviewGuideTrigger({ reviewClosed }: ReviewGuideTriggerProps) {
  const [firstVisit] = useState(() => !reviewClosed && !seenBefore());
  const [open, setOpen] = useState(firstVisit);
  const button = useRef<HTMLButtonElement>(null);

  // A layout effect runs before the dialog's focus trap notes where focus was: opened by
  // itself, the guide then hands focus back to this button on close, the way back in.
  useLayoutEffect(() => {
    if (!firstVisit) return;
    markSeen();
    button.current?.focus({ preventScroll: true });
  }, [firstVisit]);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        ref={button}
        onClick={() => setOpen(true)}
        className="max-sm:size-11 max-sm:px-0"
        data-testid="review-guide-button"
      >
        <Icon name="help" className="size-5" />
        {/* Named by its text (sr-only on phones), so the spoken name matches the visible one. */}
        <span className="max-sm:sr-only">How it works</span>
      </Button>
      <ReviewGuide open={open} onClose={() => setOpen(false)} />
    </>
  );
}
