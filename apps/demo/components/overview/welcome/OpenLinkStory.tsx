"use client";

import { AnimatePresence, motion } from "motion/react";
import { duration, spring } from "@/lib/motion";
import { Icon } from "../../ui/Icon";
import { MockCursor, type CursorPose } from "./MockCursor";
import { MockPage } from "./MockPage";
import type { SceneProps } from "./story-scene";
import { StoryMascot } from "./StoryMascot";
import { OPEN_LINK_BEATS, STORY_TEXT } from "./story-script";

const { at } = OPEN_LINK_BEATS;

function cursorPose(beat: number): CursorPose {
  if (beat === at.glide) return "on";
  if (beat === at.click) return "press";
  return "away";
}

/** A message with the review link: the link is clicked, the page opens and Squiggy looks around. */
export function OpenLinkStory({ beat, playing }: SceneProps) {
  const opened = beat >= at.open;
  return (
    <>
      <AnimatePresence initial={false}>
        {!opened && <Message key="message" pressed={beat === at.click} pose={cursorPose(beat)} />}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {opened && (
          // Grows out of the link, so the page reads as what the link opened.
          <motion.span
            key="page"
            className="absolute inset-0 block"
            style={{ originX: 0.3, originY: 0.5 }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: duration.micro } }}
            transition={spring.soft}
          >
            <MockPage />
          </motion.span>
        )}
      </AnimatePresence>
      <StoryMascot mood="searching" playing={playing} still={!playing} show={beat >= at.look} />
    </>
  );
}

interface MessageProps {
  pressed: boolean;
  pose: CursorPose;
}

/** The note the link came in, with the link as a button. */
function Message({ pressed, pose }: MessageProps) {
  return (
    <motion.span
      className="absolute inset-x-[7%] top-[24%] block rounded-tile bg-card p-3 shadow-float"
      exit={{ opacity: 0, scale: 0.94, transition: { duration: duration.micro } }}
    >
      <span className="flex items-center gap-1.5 text-label font-semibold">
        <span className="size-5 shrink-0 rounded-pill bg-(--tint)" />
        {STORY_TEXT.shareMessage}
      </span>
      <motion.span
        className="relative mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-pill bg-brand px-3 text-label font-semibold text-on-brand"
        animate={{ scale: pressed ? 0.88 : 1 }}
        transition={spring.snappy}
      >
        <Icon name="link" className="size-3.5" />
        {STORY_TEXT.shareLink}
        <MockCursor pose={pose} anchor="top-[60%] left-[70%]" />
      </motion.span>
    </motion.span>
  );
}
