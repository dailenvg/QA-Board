import type { ComponentType } from "react";
import type { StoryBeats } from "./story-script";

/** What a story's scene draws from: the beat, and whether time is moving. */
export interface SceneProps {
  beat: number;
  /** False while paused or offscreen: loops (Squiggy, typing) hold still. */
  playing: boolean;
  /** The finished frame, shown without animating into it. */
  still: boolean;
}

/** One welcome story: its real text, its tint and its animated scene. */
export interface StoryDefinition {
  title: string;
  body: string;
  /** A palette color for the scene's tinted panel and glow. */
  tint: string;
  beats: StoryBeats<string>;
  Scene: ComponentType<SceneProps>;
}
