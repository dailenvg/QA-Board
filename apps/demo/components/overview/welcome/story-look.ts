"use client";

import { createContext, useContext } from "react";

/**
 * How the welcome stories are drawn: in Squint's colors, or in its line art (grey outlines on
 * the card, a lime Squiggy the one fill). The stage sets it (`StoryStage`); the mock-ups mark
 * their parts (`mock-surface`, `mock-bar` and so on) and `globals.css` redraws them under
 * `.story-line`; the mascot reads it here.
 */
export type StoryLook = "color" | "line";

export const StoryLookContext = createContext<StoryLook>("color");

export function useStoryLook(): StoryLook {
  return useContext(StoryLookContext);
}
