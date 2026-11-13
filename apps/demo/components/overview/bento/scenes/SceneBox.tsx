"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode, RefObject } from "react";
import type { Scene } from "./use-scene";

interface SceneBoxProps {
  /** From `useScene`: the box it watches, and the scene's state. */
  sceneRef: RefObject<HTMLDivElement | null>;
  scene: Scene;
  /** Size and placement; the box keeps its room before the scene is drawn. */
  className?: string;
  children: ReactNode;
}

/**
 * Where a card's scene draws: decorative (the card says the same in words),
 * empty until it's on screen, then the scene, remounted on each replay so it
 * plays from the start, its animations skipped with reduced motion. Its art is in greys
 * (`.scene-grey`), so Squiggy is the one color in it.
 */
export function SceneBox({ sceneRef, scene, className = "", children }: SceneBoxProps) {
  return (
    <div
      ref={sceneRef}
      aria-hidden="true"
      data-testid="tile-scene"
      data-run={scene.run}
      className={`scene-grey pointer-events-none relative ${className}`}
    >
      {scene.shown ? (
        <MotionConfig skipAnimations={scene.still}>
          <div key={scene.run} className="contents">
            {children}
          </div>
        </MotionConfig>
      ) : null}
    </div>
  );
}
