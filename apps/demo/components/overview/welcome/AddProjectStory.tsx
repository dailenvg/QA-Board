"use client";

import { AnimatePresence, motion } from "motion/react";
import { duration, ease, spring } from "@/lib/motion";
import { Icon } from "../../ui/Icon";
import type { Mood } from "../../brand/mascot/moods";
import type { SceneProps } from "./story-scene";
import { StoryMascot } from "./StoryMascot";
import { TypedText } from "./TypedText";
import { ADD_PROJECT_BEATS, SCENE_S, STORY_TEXT, TYPE_MS } from "./story-script";

const { at } = ADD_PROJECT_BEATS;

function mascotMood(beat: number): Mood {
  if (beat >= at.snapshot) return "happy";
  if (beat === at.flash) return "surprised";
  return "searching";
}

/** An address types itself into New project, Create is pressed, and the page is snapped. */
export function AddProjectStory({ beat, playing, still }: SceneProps) {
  const typing = beat >= at.type;
  const captured = beat >= at.snapshot;
  return (
    <>
      <span className="absolute inset-x-[7%] top-[9%] block rounded-tile bg-card p-3 shadow-float">
        <span className="flex items-center gap-1.5 text-label font-semibold">
          <span className="grid size-5 place-items-center rounded-pill bg-brand-soft text-brand-text">
            <Icon name="globe" className="size-3" />
          </span>
          {STORY_TEXT.newProject}
        </span>
        <span className="mt-2.5 flex items-center gap-1.5">
          <span
            className={`flex h-8 min-w-0 flex-1 items-center overflow-hidden rounded-field px-2.5 text-label whitespace-nowrap ring-inset transition-shadow duration-200 ${
              typing && !captured ? "ring-2 ring-brand" : "ring-1 ring-field-line"
            }`}
          >
            {/* Crossfades, so the loop's return to an empty field doesn't snap. */}
            <AnimatePresence initial={false} mode="wait">
              <motion.span
                key={typing ? "address" : "placeholder"}
                className={typing ? "" : "text-muted"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: duration.micro }}
              >
                {typing ? (
                  <TypedText
                    text={STORY_TEXT.address}
                    charMs={TYPE_MS.address}
                    playing={playing}
                    instant={still}
                  />
                ) : (
                  STORY_TEXT.addressPlaceholder
                )}
              </motion.span>
            </AnimatePresence>
          </span>
          <motion.span
            className="grid h-8 place-items-center rounded-pill bg-brand px-3 text-label font-semibold text-on-brand"
            animate={{ scale: beat === at.press ? 0.88 : 1 }}
            transition={spring.snappy}
          >
            {STORY_TEXT.add}
          </motion.span>
        </span>
      </span>
      <AnimatePresence>{captured && <Snapshot key="snapshot" />}</AnimatePresence>
      <StoryMascot mood={mascotMood(beat)} playing={playing} still={!playing || captured} />
      <AnimatePresence>
        {beat === at.flash && (
          // One soft fade up and down, never a strobe (WCAG 2.3.1).
          <motion.span
            key="flash"
            className="absolute inset-0 z-30 block bg-on-brand dark:bg-on-brand/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.75, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: SCENE_S.flash, ease: ease.out }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/** The captured page: a small browser window that grows out of the Create button. */
function Snapshot() {
  return (
    <motion.span
      data-testid="story-snapshot"
      className="absolute -bottom-[6%] left-[7%] z-10 block w-[58%] overflow-hidden rounded-tile bg-card shadow-pop ring-1 ring-line"
      style={{ originX: 1, originY: 0 }}
      initial={{ opacity: 0, scale: 0.55, y: -32 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: duration.micro } }}
      transition={spring.soft}
    >
      <span className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <span className="size-1.5 rounded-full bg-line-strong" />
        <span className="size-1.5 rounded-full bg-line-strong" />
        <span className="size-1.5 rounded-full bg-line-strong" />
        <span className="ml-1 min-w-0 truncate rounded-pill bg-tile px-1.5 text-kbd text-muted">
          {STORY_TEXT.address}
        </span>
      </span>
      <span className="flex flex-col gap-1.5 p-2">
        <span className="block h-10 rounded-kbd bg-(--tint)/30" />
        <span className="h-1.5 w-3/4 rounded-pill bg-line-strong" />
        <span className="h-1.5 w-1/2 rounded-pill bg-line" />
        <span className="h-1.5 w-2/3 rounded-pill bg-line" />
      </span>
    </motion.span>
  );
}
