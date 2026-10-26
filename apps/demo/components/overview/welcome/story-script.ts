/**
 * The welcome stories' script: choreography and words, in one place. Every story loops in
 * STORY_LOOP_MS, so once started they stay in step; STORY_DELAYS offsets them
 * so attention travels left to right, each starting just after the previous
 * one's key beat (snapshot taken, pin dropped, comment resolved). A shared
 * link's reviewers get their own first story (open the link) in the same rhythm.
 */

import { commenterColor, type CommenterColor } from "@/lib/brand-palette";

/** One loop of any story, in ms. */
export const STORY_LOOP_MS = 5600;

/** A story's beats, in order, each with how long it holds (ms). */
export interface StoryBeats<Name extends string> {
  /** Beat lengths in play order, for `useStoryLoop`. */
  lengths: readonly number[];
  /** Each beat's index, so scenes read `beat >= at.press`. */
  at: Readonly<Record<Name, number>>;
}

function defineBeats<Name extends string>(beats: Record<Name, number>): StoryBeats<Name> {
  const names = Object.keys(beats) as Name[];
  return {
    lengths: names.map((name) => beats[name]),
    at: Object.fromEntries(names.map((name, index) => [name, index])) as Record<Name, number>,
  };
}

/** Add a project: an address types itself, Create is pressed, the page is snapped. */
export const ADD_PROJECT_BEATS = defineBeats({
  rest: 900,
  type: 1000,
  press: 400,
  flash: 500,
  snapshot: 2800,
});

/** Open the link (reviewers): a cursor clicks the link, the shared page opens, Squiggy looks around. */
export const OPEN_LINK_BEATS = defineBeats({
  rest: 800,
  glide: 1000,
  click: 300,
  open: 600,
  look: 2900,
});

/** Pin comments: a cursor glides to the button, clicks, a pin drops, a comment types. */
export const PIN_BEATS = defineBeats({
  rest: 700,
  glide: 1000,
  click: 300,
  drop: 500,
  comment: 1300,
  hold: 1800,
});

/** Resolve them: Resolve is pressed, the pin turns green, a toast, Squiggy celebrates. */
export const RESOLVE_BEATS = defineBeats({
  rest: 900,
  press: 400,
  resolve: 500,
  celebrate: 1800,
  settle: 2000,
});

/** Start offsets (ms) for the three stories, left to right. */
export const STORY_DELAYS = [0, 2200, 3400] as const;

/** Typing speed (ms per character) for the address and the comment. */
export const TYPE_MS = { address: 70, comment: 45 } as const;

/** Tween lengths (s) for the scene's set pieces. */
export const SCENE_S = {
  /** The cursor's glide to its target, a little under the glide beat. */
  glide: 0.85,
  /** The shutter's single soft flash: well under 3 flashes a second. */
  flash: 0.45,
  /** A click's ripple ring. */
  ripple: 0.5,
} as const;

/** The words inside the scenes (decorative: each card's real text sits below its scene). */
export const STORY_TEXT = {
  newProject: "New project",
  addressPlaceholder: "Website address",
  add: "Create",
  address: "acme.studio",
  comment: "Make this button bigger",
  /**
   * Whose pin it is. Pin and Resolve tell one comment's story (pinned, then
   * resolved), so both show this name, in STORY_COMMENTER's color.
   */
  commenter: "Sam",
  resolve: "Resolve",
  resolved: "Resolved",
  toast: "Comment resolved",
  /** The message a reviewer gets with the link. */
  shareMessage: "Can you take a look?",
  shareLink: "Open review",
  /** The review window's chip, part way through. */
  timeLeft: "2d 23h 12m left",
} as const;

/** The commenter's color in both Pin and Resolve (pin, dot and the Pin card's tint). */
export const STORY_COMMENTER: CommenterColor = commenterColor(STORY_TEXT.commenter);
