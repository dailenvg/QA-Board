import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStoryClock } from "./story-clock";
import {
  ADD_PROJECT_BEATS,
  OPEN_LINK_BEATS,
  PIN_BEATS,
  RESOLVE_BEATS,
  STORY_LOOP_MS,
  type StoryBeats,
} from "./story-script";

function clockWith(beats: readonly number[], delay = 0) {
  const seen: number[] = [];
  const clock = createStoryClock({ beats, delay, onBeat: (beat) => seen.push(beat) });
  return { clock, seen };
}

describe("createStoryClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances through the beats and loops back to the first", () => {
    const { clock, seen } = clockWith([100, 200, 300]);
    clock.play();
    expect(clock.beat).toBe(0);
    vi.advanceTimersByTime(99);
    expect(clock.beat).toBe(0);
    vi.advanceTimersByTime(1);
    expect(clock.beat).toBe(1);
    vi.advanceTimersByTime(200);
    expect(clock.beat).toBe(2);
    vi.advanceTimersByTime(300);
    expect(clock.beat).toBe(0);
    expect(seen).toEqual([1, 2, 0]);
  });

  it("waits out the start delay once, not on every loop", () => {
    const { clock } = clockWith([100, 100], 250);
    clock.play();
    vi.advanceTimersByTime(349);
    expect(clock.beat).toBe(0);
    vi.advanceTimersByTime(1);
    expect(clock.beat).toBe(1);
    vi.advanceTimersByTime(100);
    expect(clock.beat).toBe(0);
    vi.advanceTimersByTime(100);
    expect(clock.beat).toBe(1);
  });

  it("does nothing until played", () => {
    const { clock, seen } = clockWith([100, 100]);
    vi.advanceTimersByTime(1000);
    expect(clock.beat).toBe(0);
    expect(clock.running).toBe(false);
    expect(seen).toEqual([]);
  });

  it("pauses on the current beat and resumes with the time that was left", () => {
    const { clock } = clockWith([100, 400, 100]);
    clock.play();
    vi.advanceTimersByTime(100 + 150);
    expect(clock.beat).toBe(1);

    clock.pause();
    expect(clock.running).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(clock.beat).toBe(1);

    clock.play();
    vi.advanceTimersByTime(249);
    expect(clock.beat).toBe(1);
    vi.advanceTimersByTime(1);
    expect(clock.beat).toBe(2);
  });

  it("ignores a second play while running", () => {
    const { clock } = clockWith([100, 100]);
    clock.play();
    vi.advanceTimersByTime(60);
    clock.play();
    vi.advanceTimersByTime(40);
    expect(clock.beat).toBe(1);
  });

  it("restarts from the first beat, running or not", () => {
    const { clock, seen } = clockWith([100, 100, 100]);
    clock.play();
    vi.advanceTimersByTime(150);
    expect(clock.beat).toBe(1);

    clock.restart();
    expect(clock.beat).toBe(0);
    expect(clock.running).toBe(true);
    vi.advanceTimersByTime(100);
    expect(clock.beat).toBe(1);

    clock.pause();
    clock.restart();
    expect(clock.beat).toBe(0);
    expect(clock.running).toBe(false);
    expect(seen).toEqual([1, 0, 1, 0]);
  });

  it("settles on the last beat, the finished frame, and holds it", () => {
    const { clock, seen } = clockWith([100, 100, 100]);
    clock.play();
    clock.settle();
    expect(clock.beat).toBe(2);
    expect(clock.running).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(clock.beat).toBe(2);
    expect(seen).toEqual([2]);
  });

  it("plays on from a settled frame after the start delay", () => {
    const { clock } = clockWith([100, 100, 100], 300);
    clock.settle();
    clock.play();
    vi.advanceTimersByTime(299);
    expect(clock.beat).toBe(2);
    vi.advanceTimersByTime(1);
    expect(clock.beat).toBe(0);
  });

  it("rejects a story without beats or with an empty beat", () => {
    expect(() => clockWith([])).toThrow();
    expect(() => clockWith([100, 0])).toThrow();
  });
});

describe("story beats", () => {
  const stories: Record<string, StoryBeats<string>> = {
    "add a project": ADD_PROJECT_BEATS,
    "open the link": OPEN_LINK_BEATS,
    "pin comments": PIN_BEATS,
    "resolve them": RESOLVE_BEATS,
  };

  it.each(Object.entries(stories))("%s loops in the shared loop length", (_, story) => {
    expect(story.lengths.reduce((sum, ms) => sum + ms, 0)).toBe(STORY_LOOP_MS);
  });

  it("indexes each beat in play order", () => {
    expect(PIN_BEATS.at).toEqual({ rest: 0, glide: 1, click: 2, drop: 3, comment: 4, hold: 5 });
  });
});
