import { RESOLVED_GREEN, paletteEntry } from "@/lib/brand-palette";
import { REVIEW_WINDOW_HOURS } from "@/lib/share/review-window";
import { OpenLinkStory } from "./OpenLinkStory";
import { PinStory } from "./PinStory";
import { ReviewResolveStory } from "./ReviewResolveStory";
import type { StoryDefinition } from "./story-scene";
import { OPEN_LINK_BEATS, PIN_BEATS, RESOLVE_BEATS, STORY_COMMENTER } from "./story-script";

/**
 * How a shared link works, for the client reviewing it: open the link, pin a
 * comment, and send feedback before the review window closes. The same
 * rhythm, tints and scenes as the owner's welcome, from the reviewer's side.
 */
export const REVIEWER_STORIES: readonly StoryDefinition[] = [
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
    title: `Send feedback within ${REVIEW_WINDOW_HOURS} hours`,
    body: "The countdown starts when the link is shared. The owner fixes and resolves what you send in time.",
    tint: RESOLVED_GREEN.hex,
    beats: RESOLVE_BEATS,
    Scene: ReviewResolveStory,
  },
];
