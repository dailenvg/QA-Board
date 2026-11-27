/**
 * Space on the comment canvas: held, it may become a drag (Space-drag pans a zoomed surface),
 * so the pin is placed when Space comes up, and only if no pointer went down meanwhile.
 */
export type SpacePress = "up" | "down" | "dragged";

export type SpacePressEvent = "keydown" | "pointerdown" | "keyup" | "blur";

export interface SpacePressStep {
  next: SpacePress;
  /** Place the pin now. */
  place: boolean;
}

export function spacePressStep(state: SpacePress, event: SpacePressEvent): SpacePressStep {
  switch (event) {
    case "keydown":
      // A held key repeats: the press already under way carries on.
      return { next: state === "up" ? "down" : state, place: false };
    case "pointerdown":
      return { next: state === "up" ? "up" : "dragged", place: false };
    case "keyup":
      return { next: "up", place: state === "down" };
    case "blur":
      return { next: "up", place: false };
  }
}
