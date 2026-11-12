import { describe, expect, it } from "vitest";
import { keyboardOverlap, roomAboveKeyboard } from "./use-fit-above-keyboard";

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

describe("keyboardOverlap", () => {
  it("is what lies below the visible part of the screen", () => {
    // An 860px-tall phone whose keyboard leaves its top 520px visible.
    expect(keyboardOverlap(860, 0, 520)).toBe(340);
  });

  it("shrinks as the visible part is scrolled down", () => {
    expect(keyboardOverlap(860, 100, 520)).toBe(240);
  });

  it("is 0 without a keyboard, and never negative", () => {
    expect(keyboardOverlap(860, 0, 860)).toBe(0);
    expect(keyboardOverlap(860, 10, 860)).toBe(0);
  });
});
