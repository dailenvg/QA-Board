"use client";

import { AnimatePresence, motion } from "motion/react";
import { ease } from "@/lib/motion";
import type { Mood } from "../../brand/mascot/moods";
import { MockComment } from "./MockComment";
import { MockCursor, type CursorPose } from "./MockCursor";
import { MockPage } from "./MockPage";
import { MockPin } from "./MockPin";
import type { SceneProps } from "./story-scene";
import { StoryMascot } from "./StoryMascot";
import { TypedText } from "./TypedText";
import {
  PIN_BEATS,
  SCENE_S,
  STORY_COMMENTER as COMMENTER,
  STORY_TEXT,
  TYPE_MS,
} from "./story-script";

const { at } = PIN_BEATS;

function cursorPose(beat: number): CursorPose {
  if (beat === at.glide) return "on";
  if (beat === at.click) return "press";
  if (beat === at.drop || beat === at.comment) return "aside";
  return "away";
}

/** A cursor clicks the page's button, a pin drops there and a comment types itself. */
export function PinStory({ beat, playing, still }: SceneProps) {
  const mood: Mood = beat === at.comment ? "talking" : "listening";
  return (
    <>
      <MockPage
        pressed={beat === at.click}
        onButton={
          <>
            <AnimatePresence>
              {beat >= at.drop && <MockPin key="pin" color={COMMENTER} />}
            </AnimatePresence>
            <AnimatePresence>{beat === at.click && <Ripple key="ripple" />}</AnimatePresence>
            <MockCursor pose={cursorPose(beat)} />
          </>
        }
      >
        <AnimatePresence>
          {beat >= at.comment && (
            <MockComment key="comment" author={STORY_TEXT.commenter} color={COMMENTER}>
              <TypedText
                text={STORY_TEXT.comment}
                charMs={TYPE_MS.comment}
                playing={playing}
                instant={still}
              />
            </MockComment>
          )}
        </AnimatePresence>
      </MockPage>
      {/* Leans in from the left once the pin lands: clear of the cursor's path, the pin and the comment. */}
      <StoryMascot
        mood={mood}
        playing={playing}
        still={!playing}
        edge="left"
        size="3.5rem"
        show={beat >= at.drop}
      />
    </>
  );
}

/** One ring spreading out from a click. */
function Ripple() {
  return (
    <motion.span
      className="absolute inset-0 block rounded-pill ring-2 ring-brand"
      initial={{ opacity: 0.7, scale: 1 }}
      animate={{ opacity: 0, scale: 1.6 }}
      exit={{ opacity: 0 }}
      transition={{ duration: SCENE_S.ripple, ease: ease.out }}
    />
  );
}
