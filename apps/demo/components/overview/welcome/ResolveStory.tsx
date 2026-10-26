"use client";

import { AnimatePresence, motion } from "motion/react";
import { duration, spring } from "@/lib/motion";
import { Icon } from "../../ui/Icon";
import type { Mood } from "../../brand/mascot/moods";
import { MockComment } from "./MockComment";
import { MockCursor, type CursorPose } from "./MockCursor";
import { MockPage } from "./MockPage";
import { MockPin } from "./MockPin";
import type { SceneProps } from "./story-scene";
import { StoryMascot } from "./StoryMascot";
import { RESOLVE_BEATS, STORY_COMMENTER as COMMENTER, STORY_TEXT } from "./story-script";

const { at } = RESOLVE_BEATS;

/** The cursor steps off Resolve, then leaves before the toast, clearing the corner for Squiggy. */
function cursorPose(beat: number): CursorPose {
  if (beat === at.rest) return "on";
  if (beat === at.press) return "press";
  if (beat === at.resolve) return "aside";
  return "away";
}

function mascotMood(beat: number): Mood {
  if (beat === at.celebrate) return "resolved";
  if (beat === at.settle) return "happy";
  return "listening";
}

/** Resolve is pressed: the pin turns green, a toast confirms it and Squiggy celebrates. */
export function ResolveStory({ beat, playing }: SceneProps) {
  const resolved = beat >= at.resolve;
  return (
    <>
      <MockPage onButton={<MockPin color={COMMENTER} resolved={resolved} />}>
        <MockComment
          author={STORY_TEXT.commenter}
          color={COMMENTER}
          footer={
            <ResolveButton
              pressed={beat === at.press}
              resolved={resolved}
              pose={cursorPose(beat)}
            />
          }
        >
          {STORY_TEXT.comment}
        </MockComment>
      </MockPage>
      {/* Hops up once the comment is resolved, beside the toast, never over Resolve. */}
      <StoryMascot
        mood={mascotMood(beat)}
        playing={playing}
        still={!playing || beat === at.settle}
        size="3rem"
        show={resolved}
      />
      <AnimatePresence>{beat >= at.celebrate && <Toast key="toast" />}</AnimatePresence>
    </>
  );
}

interface ResolveButtonProps {
  pressed: boolean;
  resolved: boolean;
  pose: CursorPose;
}

function ResolveButton({ pressed, resolved, pose }: ResolveButtonProps) {
  return (
    <motion.span
      className={`relative mt-1.5 inline-flex h-5 items-center gap-1 rounded-pill px-2 text-kbd font-semibold transition-[background-color,color,box-shadow] duration-200 ${
        resolved
          ? "bg-resolved-soft text-resolved-text"
          : "bg-card text-ink ring-1 ring-line-strong ring-inset"
      }`}
      animate={{ scale: pressed ? 0.88 : 1 }}
      transition={spring.snappy}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={resolved ? "resolved" : "resolve"}
          className="inline-flex items-center gap-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: duration.micro }}
        >
          {resolved && <Icon name="check" className="size-2.5" />}
          {resolved ? STORY_TEXT.resolved : STORY_TEXT.resolve}
        </motion.span>
      </AnimatePresence>
      {/* Clicks near the end, so the label stays readable. */}
      <MockCursor pose={pose} anchor="top-[65%] left-[88%]" />
    </motion.span>
  );
}

/** The confirmation that slides up from the bottom. */
function Toast() {
  return (
    <motion.span
      data-testid="story-toast"
      className="absolute bottom-[7%] left-[7%] z-20 flex items-center gap-1.5 rounded-pill bg-inv py-1.5 pr-3 pl-1.5 text-label font-semibold text-on-inv shadow-pop"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8, transition: { duration: duration.micro } }}
      transition={spring.snappy}
    >
      <span className="grid size-4.5 place-items-center rounded-full bg-resolved-pin text-on-resolved-pin">
        <Icon name="check" className="size-3" />
      </span>
      {STORY_TEXT.toast}
    </motion.span>
  );
}
