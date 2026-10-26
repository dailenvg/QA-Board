"use client";

import { Icon } from "../../ui/Icon";
import { ResolveStory } from "./ResolveStory";
import type { SceneProps } from "./story-scene";
import { STORY_TEXT } from "./story-script";

/**
 * The Resolve story for a shared link's reviewers: the owner resolves their
 * comment, under the review window's chip, which says the link takes comments
 * for a limited time.
 */
export function ReviewResolveStory(props: SceneProps) {
  return (
    <>
      <ResolveStory {...props} />
      <span className="absolute top-[3%] right-[5%] z-10 inline-flex items-center gap-1 rounded-pill bg-comments-soft px-2 py-1 text-kbd font-semibold text-comments-text shadow-float">
        <Icon name="clock" className="size-3" />
        {STORY_TEXT.timeLeft}
      </span>
    </>
  );
}
