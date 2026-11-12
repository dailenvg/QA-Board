"use client";

import { motion } from "motion/react";
import { useMemo } from "react";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import type { ClientBrand } from "@/lib/share/types";
import { PauseToggle } from "../overview/welcome/PauseToggle";
import { reviewerStories } from "../overview/welcome/reviewer-stories";
import { useStoryPlayback } from "../overview/welcome/use-story-playback";
import { WelcomeStories } from "../overview/welcome/WelcomeStories";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { BrandMark } from "./BrandMark";
import { GENERIC_INVITATION, invitationLine } from "./invitation-copy";

const stagger = staggerGroup(0.07, 0.12);

interface ReviewGuideProps {
  open: boolean;
  onClose: () => void;
  token: string;
  brand: ClientBrand;
  /** The shared project's name. */
  project: string;
  /** How long the link takes comments, in hours from its creation; null for no limit. */
  reviewWindowHours: number | null;
}

/** Who invited the reviewer, beside the company's logo; the generic line on an anonymous link. */
function Invitation({
  token,
  brand,
  project,
}: Pick<ReviewGuideProps, "token" | "brand" | "project">) {
  if (!brand.custom) return GENERIC_INVITATION;
  return (
    <span className="flex items-center gap-3 pt-2" data-testid="review-guide-invitation">
      <BrandMark token={token} brand={brand} />
      <span className="min-w-0">{invitationLine(brand.name, project)}</span>
    </span>
  );
}

/**
 * How a shared review works, for the client: the welcome's looping stories,
 * told from the reviewer's side, with the same Pause and reduced-motion rules.
 * It opens with who invited them to which project (the company's name and logo).
 */
export function ReviewGuide({
  open,
  onClose,
  token,
  brand,
  project,
  reviewWindowHours,
}: ReviewGuideProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="How it works"
      description={<Invitation token={token} brand={brand} project={project} />}
      size="lg"
      testId="review-guide"
    >
      <ReviewGuideBody onClose={onClose} reviewWindowHours={reviewWindowHours} />
    </Dialog>
  );
}

/** Mounted with the open dialog, so its stories start (and stop) with it. */
function ReviewGuideBody({
  onClose,
  reviewWindowHours,
}: Pick<ReviewGuideProps, "onClose" | "reviewWindowHours">) {
  const reveal = useRevealVariants();
  const playback = useStoryPlayback();
  const stories = useMemo(() => reviewerStories(reviewWindowHours), [reviewWindowHours]);
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-5"
    >
      <WelcomeStories playback={playback} stories={stories} />
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
