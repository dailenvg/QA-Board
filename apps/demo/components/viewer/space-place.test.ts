import { describe, expect, it } from "vitest";
import { spacePressStep, type SpacePress, type SpacePressEvent } from "./space-place";

/** Runs `events` from rest, returning whether any of them placed the pin. */
function placed(events: readonly SpacePressEvent[]): boolean {
  let state: SpacePress = "up";
  let any = false;
  for (const event of events) {
    const step = spacePressStep(state, event);
    state = step.next;
    any ||= step.place;
  }
  return any;
}

describe("Space on the comment canvas", () => {
  it("places the pin when Space comes up, not when it goes down", () => {
    expect(spacePressStep("up", "keydown")).toEqual({ next: "down", place: false });
    expect(spacePressStep("down", "keyup")).toEqual({ next: "up", place: true });
  });

  it("places it once however long Space is held", () => {
    expect(placed(["keydown", "keydown", "keydown", "keyup"])).toBe(true);
    expect(spacePressStep("down", "keydown").next).toBe("down");
  });

  it("places nothing after a drag while Space was held", () => {
    expect(placed(["keydown", "pointerdown", "keyup"])).toBe(false);
    expect(placed(["keydown", "pointerdown", "keydown", "keyup"])).toBe(false);
  });

  it("places nothing when focus leaves first, or for a keyup it never saw go down", () => {
    expect(placed(["keydown", "blur", "keyup"])).toBe(false);
    expect(placed(["keyup"])).toBe(false);
  });

  it("ignores a pointer going down with Space up, and starts afresh next time", () => {
    expect(placed(["pointerdown", "keydown", "keyup"])).toBe(true);
    expect(placed(["keydown", "pointerdown", "keyup", "keydown", "keyup"])).toBe(true);
  });
});
