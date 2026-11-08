import { describe, expect, it } from "vitest";
import { AVERTED_GAZE, eyePose } from "./eye-pose";
import { MOOD_SPECS, MOODS } from "./moods";

describe("eyePose", () => {
  it.each(MOODS)("shuts the eyes and looks away while averted, whatever the mood (%s)", (mood) => {
    const pose = eyePose(MOOD_SPECS[mood], { held: false, averted: true });
    expect(pose.source).toBe("averted");
    expect(pose.left.scaleY).toBeLessThan(0.2);
    expect(pose.right.scaleY).toBeLessThan(0.2);
    expect(pose.gaze).toEqual(AVERTED_GAZE);
    expect(pose.blinks).toBe(false);
  });

  it("goes back to the mood's own eyes once nothing is averted", () => {
    const spec = MOOD_SPECS.thinking;
    expect(eyePose(spec, { held: false, averted: false })).toEqual({
      source: "mood",
      left: spec.leftEye,
      right: spec.rightEye,
      gaze: spec.gaze,
      blinks: spec.blinks,
    });
  });

  it("opens the eyes wide when picked up, averted or not", () => {
    const pose = eyePose(MOOD_SPECS.idle, { held: true, averted: true });
    expect(pose.source).toBe("held");
    expect(pose.left.scaleY).toBe(1);
    expect(pose.right.scaleY).toBe(1);
  });
});
