import { RESOLVED_GREEN, paletteEntry } from "@/lib/brand-palette";
import { REVIEW_WINDOW_LABELS, windowChoice } from "@/lib/share/review-window";
import { OpenLinkStory } from "./OpenLinkStory";
import { PinStory } from "./PinStory";
import { ResolveStory } from "./ResolveStory";
import { reviewResolveScene } from "./ReviewResolveStory";
import type { StoryDefinition } from "./story-scene";
import { OPEN_LINK_BEATS, PIN_BEATS, RESOLVE_BEATS, STORY_COMMENTER } from "./story-script";

/** The last story's words: the link's own window, or none at all. */
function sendCopy(windowHours: number | null): Pick<StoryDefinition, "title" | "body"> {
  if (windowHours === null) {
    return {
      title: "Send feedback when you're ready",
      body: "This link has no deadline. The owner fixes and resolves what you send.",
    };
  }
  return {
    title: `Send feedback within ${REVIEW_WINDOW_LABELS[windowChoice(windowHours)]}`,
    body: "The countdown starts when the link is shared. The owner fixes and resolves what you send in time.",
  };
}

/**
 * How a shared link works, for the client reviewing it: open the link, pin a
 * comment, and send feedback before the review window closes (`windowHours`
 * from the link's creation; null for a link without one). The same rhythm,
 * tints and scenes as the owner's welcome, from the reviewer's side.
 */
export const reviewerStories = (windowHours: number | null): readonly StoryDefinition[] => [
  {
    title: "Look around",
    body: "Explore the project in your browser before you comment.",
    tint: paletteEntry("probiotic").hex,
    beats: OPEN_LINK_BEATS,
    Scene: OpenLinkStory,
  },
  {
    title: "Pin a comment",
    body: "Switch to Comment, then click or tap any spot to leave feedback there.",
    tint: STORY_COMMENTER.hex,
    beats: PIN_BEATS,
    Scene: PinStory,
  },
  {
    ...sendCopy(windowHours),
    tint: RESOLVED_GREEN.hex,
    pale: true,
    beats: RESOLVE_BEATS,
    // A link without a deadline shows no countdown chip, as the guest's top bar doesn't; any
    // other shows one within its own window.
    Scene: windowHours === null ? ResolveStory : reviewResolveScene(windowHours),
  },
];
