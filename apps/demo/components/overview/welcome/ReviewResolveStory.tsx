"use client";

import type { ComponentType } from "react";
import { windowChoice, type ReviewWindowChoice } from "@/lib/share/review-window";
import { Icon } from "../../ui/Icon";
import { ResolveStory } from "./ResolveStory";
import type { SceneProps } from "./story-scene";
import { storyTimeLeft } from "./story-script";

/**
 * The Resolve story for a shared link's reviewers: the owner resolves their
 * comment, under the review window's chip, which says the link takes comments
 * for a limited time (`timeLeft`, within the link's own window).
 */
function ReviewResolveStory({ timeLeft, ...props }: SceneProps & { timeLeft: string }) {
  return (
    <>
      <ResolveStory {...props} />
      <span className="mock-chip absolute top-[3%] right-[5%] z-10 inline-flex items-center gap-1 rounded-pill bg-comments-soft px-2 py-1 text-kbd font-semibold text-comments-text shadow-float">
        <Icon name="clock" className="size-3" />
        {timeLeft}
      </span>
    </>
  );
}

/** A scene for one window's chip, made once, so the story keeps its identity across renders. */
function sceneFor(hours: number): ComponentType<SceneProps> {
  const timeLeft = storyTimeLeft(hours);
  const Scene = (props: SceneProps) => <ReviewResolveStory {...props} timeLeft={timeLeft} />;
  Scene.displayName = `ReviewResolveStory(${hours}h)`;
  return Scene;
}

type LimitedWindow = Exclude<ReviewWindowChoice, "none">;

const SCENES: Record<LimitedWindow, ComponentType<SceneProps>> = {
  "24h": sceneFor(24),
  "72h": sceneFor(72),
  "7d": sceneFor(168),
};

/** The reviewer's Resolve scene for a link whose window is `windowHours` long. */
export function reviewResolveScene(windowHours: number): ComponentType<SceneProps> {
  const choice = windowChoice(windowHours);
  return SCENES[choice === "none" ? "72h" : choice];
}
