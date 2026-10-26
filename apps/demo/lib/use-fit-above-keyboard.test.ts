import { describe, expect, it } from "vitest";
import { roomAboveKeyboard } from "./use-fit-above-keyboard";

describe("roomAboveKeyboard", () => {
  it("ends a gap above the visible bottom", () => {
    // A popup at 90px on a phone whose keyboard leaves 420px visible.
    expect(roomAboveKeyboard(90, 420)).toBe(318);
  });

  it("keeps a usable minimum when there's barely any room", () => {
    expect(roomAboveKeyboard(300, 330)).toBe(120);
  });

  it("rounds down, so it never overlaps by a fraction", () => {
    expect(roomAboveKeyboard(90.4, 420)).toBe(317);
  });
});
