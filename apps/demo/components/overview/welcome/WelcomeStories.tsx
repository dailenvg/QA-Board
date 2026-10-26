"use client";

import { RESOLVED_GREEN, paletteEntry } from "@/lib/brand-palette";
import { AddProjectStory } from "./AddProjectStory";
import { PinStory } from "./PinStory";
import { ResolveStory } from "./ResolveStory";
import { StoryCard } from "./StoryCard";
import type { StoryDefinition } from "./story-scene";
import {
  ADD_PROJECT_BEATS,
  PIN_BEATS,
  RESOLVE_BEATS,
  STORY_COMMENTER,
  STORY_DELAYS,
} from "./story-script";
import type { StoryPlayback } from "./use-story-playback";

const STORIES: readonly StoryDefinition[] = [
  {
    title: "Add a project",
    body: "Paste a website address, or upload images or a PDF.",
    tint: paletteEntry("probiotic").hex,
    beats: ADD_PROJECT_BEATS,
    Scene: AddProjectStory,
  },
  {
    title: "Pin comments",
    body: "Click or tap anywhere on it to leave feedback.",
    tint: STORY_COMMENTER.hex,
    beats: PIN_BEATS,
    Scene: PinStory,
  },
  {
    title: "Resolve them",
    body: "Mark each comment resolved once it's fixed.",
    tint: RESOLVED_GREEN.hex,
    beats: RESOLVE_BEATS,
    Scene: ResolveStory,
  },
];

interface WelcomeStoriesProps {
  playback: StoryPlayback;
}

/**
 * How Squint works, as a bento of three short looping stories. One column on
 * phones; two (the last card wide) when the bento has room; three when each
 * card gets enough width for its scene. Sized by its container, not the
 * viewport, since the sidebar takes a share of the screen from `lg` up.
 *
 * The cards explain; they aren't buttons. The panel's one action (Add your
 * first project) sits below them, so pinning and resolving never seem to
 * open New project, and keyboard users don't tab through three copies of it.
 */
export function WelcomeStories({ playback }: WelcomeStoriesProps) {
  return (
    <div className="@container w-full">
      {/* role="list": Safari drops list semantics from lists styled without markers. */}
      <ol
        role="list"
        data-testid="welcome-stories"
        className="grid gap-4 @[34rem]:grid-cols-2 @[52rem]:grid-cols-3"
      >
        {STORIES.map((story, index) => (
          <StoryCard
            key={story.title}
            step={index + 1}
            story={story}
            delay={STORY_DELAYS[index] ?? 0}
            running={playback.running}
            still={playback.still}
            wide={index === STORIES.length - 1}
          />
        ))}
      </ol>
    </div>
  );
}
