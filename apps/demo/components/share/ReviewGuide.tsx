"use client";

import { motion } from "motion/react";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import { PauseToggle } from "../overview/welcome/PauseToggle";
import { REVIEWER_STORIES } from "../overview/welcome/reviewer-stories";
import { useStoryPlayback } from "../overview/welcome/use-story-playback";
import { WelcomeStories } from "../overview/welcome/WelcomeStories";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

const stagger = staggerGroup(0.07, 0.12);

interface ReviewGuideProps {
  open: boolean;
  onClose: () => void;
}

/**
 * How a shared review works, for the client: the welcome's looping stories,
 * told from the reviewer's side, with the same Pause and reduced-motion rules.
 */
export function ReviewGuide({ open, onClose }: ReviewGuideProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="How it works"
      description="Here's how to leave feedback on this project."
      size="lg"
      testId="review-guide"
    >
      <ReviewGuideBody onClose={onClose} />
    </Dialog>
  );
}

/** Mounted with the open dialog, so its stories start (and stop) with it. */
function ReviewGuideBody({ onClose }: { onClose: () => void }) {
  const reveal = useRevealVariants();
  const playback = useStoryPlayback();
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-5"
    >
      <WelcomeStories playback={playback} stories={REVIEWER_STORIES} />
      {/*
       * Pinned to the dialog's bottom edge (over its padding), so on phones and short screens
       * Pause (WCAG 2.2.2) and the way out stay in reach instead of after three stacked stories.
       */}
      <motion.div
        variants={reveal}
        className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-col-reverse gap-2 border-t border-line bg-panel px-5 pt-4 pb-5 sm:-mx-6 sm:-mb-6 sm:flex-row sm:items-center sm:justify-end sm:px-6 sm:pb-6"
      >
        {playback.reduced ? null : (
          <div className="sm:mr-auto">
            <PauseToggle paused={playback.paused} onChange={playback.setPaused} />
          </div>
        )}
        <Button onClick={onClose} data-testid="review-guide-start">
          Start reviewing
        </Button>
      </motion.div>
    </motion.div>
  );
}
