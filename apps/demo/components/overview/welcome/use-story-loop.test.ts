import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useStoryLoop } from "./use-story-loop";

const LENGTHS = [100, 200, 300, 400];

function Probe({ playing, still }: { playing: boolean; still: boolean }) {
  const { beat } = useStoryLoop(LENGTHS, { playing, still });
  return createElement("output", null, beat);
}

function firstFrame(props: { playing: boolean; still: boolean }): string {
  return renderToStaticMarkup(createElement(Probe, props));
}

// Timing (advance, pause, resume, restart) is covered by story-clock.test.ts;
// these pin down what the hook shows before any timer has run.
describe("useStoryLoop", () => {
  it("starts on the first beat", () => {
    expect(firstFrame({ playing: true, still: false })).toBe("<output>0</output>");
  });

  it("starts on the first beat while paused", () => {
    expect(firstFrame({ playing: false, still: false })).toBe("<output>0</output>");
  });

  it("jumps straight to the finished frame when still (reduced motion)", () => {
    expect(firstFrame({ playing: true, still: true })).toBe("<output>3</output>");
    expect(firstFrame({ playing: false, still: true })).toBe("<output>3</output>");
  });
});
