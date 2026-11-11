import type { PinColor } from "../../welcome/MockPin";

/** A scene's open pins: the scene's dark grey, numbered in white (`globals.css`). */
export const SCENE_PIN: PinColor = {
  id: "scene",
  hex: "var(--color-scene-mark)",
  ink: "var(--color-scene-mark-ink)",
};

/** A scene's stage and glows: a grey wash, so Squiggy is the one color in the scene. */
export const SCENE_TINT = "var(--color-scene-tint)";
