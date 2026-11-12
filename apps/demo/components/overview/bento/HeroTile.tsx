"use client";

import { motion } from "motion/react";
import { useId, useState, type CSSProperties } from "react";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import { useSquiggyMood } from "@/lib/squiggy/use-squiggy-mood";
import { Squiggy } from "../../brand/mascot/Squiggy";
import { Highlight } from "../../ui/Highlight";
import { HERO_MASCOT_SIZE } from "../OverviewHero";
import { SquiggySpeechLine } from "../SquiggySpeechLine";
import { StoryGlow } from "../welcome/StoryGlow";
import { SCENE_TINT } from "./scenes/scene-colors";
import { HeroScene } from "./scenes/HeroScene";
import { SceneBox } from "./scenes/SceneBox";
import { useScene } from "./scenes/use-scene";
import { TILE_SURFACE } from "./tile-styles";

const stagger = staggerGroup(0.07, 0.1);

interface HeroTileProps {
  /** What the workspace holds, in a line, for when Squiggy has nothing specific to say. */
  summary: string;
  /** The workspace's comments, for the pins on the project page beside Squiggy. */
  open: number;
  resolved: number;
}

/**
 * The bento's lead tile: Squiggy, whose mood follows the workspace
 * (`useSquiggyMood`), the page's headline, and Squiggy's line about the
 * workspace (comments waiting, all resolved, or what just happened), else a
 * line saying what it holds. From md, a project page beside them carries the
 * workspace's pins (open and resolved), dropping in as the tile arrives and
 * again on hover or focus.
 *
 * Squiggy holds each mood's pose rather than looping it (WCAG 2.2.2): the
 * Overview is read beside it, and the bento only offers Pause beside the client
 * story, which isn't always there. Mood changes, blinks, its gaze, hover and
 * pokes still animate, as with the other mascots that sit beside content, and it
 * hops hello once as the tile arrives and on hover or focus.
 */
export function HeroTile({ summary, open, resolved }: HeroTileProps) {
  const reveal = useRevealVariants();
  const squiggy = useSquiggyMood();
  const headingId = useId();
  const [sceneRef, scene] = useScene();
  // Squiggy hops hello as the tile arrives, and again with the scene on hover or focus.
  const [greet, setGreet] = useState(1);
  const replay = () => {
    scene.replay();
    setGreet((count) => count + 1);
  };
  return (
    <motion.section
      variants={stagger}
      initial="hidden"
      animate="visible"
      aria-labelledby={headingId}
      data-testid="overview-hero"
      onPointerEnter={replay}
      onFocus={replay}
      // Where the bento fits one screen, a smaller Squiggy leaves the rows below their room.
      className={`${TILE_SURFACE} relative isolate justify-center overflow-hidden [--hero-mascot:var(--hero-mascot-size)] sm:flex-row sm:items-center sm:gap-8 bento-fit:[--hero-mascot:6rem]`}
      style={{ "--hero-mascot-size": HERO_MASCOT_SIZE } as CSSProperties}
    >
      <StoryGlow
        color={SCENE_TINT}
        className="top-6 left-1/2 -z-10 size-40 -translate-x-1/2 opacity-20 sm:top-1/2 sm:left-6 sm:translate-x-0 sm:-translate-y-1/2 dark:opacity-30"
      />
      <StoryGlow
        color={SCENE_TINT}
        className="-right-12 -bottom-20 -z-10 size-56 opacity-20 dark:opacity-5"
      />
      <motion.div
        variants={reveal}
        className="shrink-0 self-center"
        data-testid="squiggy"
        data-mood={squiggy.mood}
      >
        <Squiggy
          mood={squiggy.mood}
          size="var(--hero-mascot)"
          onPoke={squiggy.poke}
          greet={greet}
          still
        />
      </motion.div>
      <div className="flex min-w-0 flex-col items-center gap-3 text-center sm:items-start sm:text-left">
        <motion.p variants={reveal} className="label-caps text-brand-text">
          Overview
        </motion.p>
        <motion.h1 id={headingId} variants={reveal} className="text-display font-bold text-balance">
          Your projects <Highlight>at a glance</Highlight>
        </motion.h1>
        <motion.div variants={reveal}>
          <SquiggySpeechLine speech={squiggy.speech} fallback={summary} />
        </motion.div>
      </div>
      {/* aspect-[4/3]: the stage's own shape, so the box holds its room before the scene draws. */}
      <SceneBox
        sceneRef={sceneRef}
        scene={scene}
        className="ml-auto hidden aspect-[4/3] w-40 shrink-0 md:block"
      >
        <HeroScene open={open} resolved={resolved} still={scene.still} />
      </SceneBox>
    </motion.section>
  );
}
