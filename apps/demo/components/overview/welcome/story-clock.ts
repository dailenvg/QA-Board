/**
 * A looping timeline of beats for the welcome stories. Each entry in `beats` is
 * how long (ms) that beat holds before the next one; after the last beat it
 * loops back to the first. Pausing keeps the time left in the current beat, so
 * resuming picks up exactly where it stopped. Framework-free, so the timing is
 * testable with fake timers; `useStoryLoop` wires it to React.
 */
export interface StoryClock {
  readonly beat: number;
  readonly running: boolean;
  /** Starts or resumes the timeline. No-op while running. */
  play(): void;
  /** Stops on the current beat, keeping the time left in it. */
  pause(): void;
  /** Back to the first beat with its full length; keeps running if it was. */
  restart(): void;
  /**
   * Stops on the last beat, the story's finished frame. The next `play` waits
   * out the start delay again, then loops into the first beat.
   */
  settle(): void;
}

interface StoryClockOptions {
  beats: readonly number[];
  /** Extra wait before the first beat ends, so several stories can play in turn. */
  delay?: number;
  onBeat: (beat: number) => void;
}

export function createStoryClock({ beats, delay = 0, onBeat }: StoryClockOptions): StoryClock {
  if (beats.length === 0 || beats.some((ms) => !(ms > 0))) {
    throw new Error("A story needs at least one beat, each longer than 0 ms.");
  }
  const last = beats.length - 1;
  const lengthOf = (index: number) => beats[index] ?? 0;

  let beat = 0;
  let remaining = lengthOf(0) + delay;
  let deadline = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    remaining = Math.max(0, deadline - Date.now());
  };

  const schedule = () => {
    deadline = Date.now() + remaining;
    timer = setTimeout(advance, remaining);
  };

  const goTo = (index: number, length: number) => {
    beat = index;
    remaining = length;
    onBeat(index);
  };

  function advance() {
    timer = undefined;
    const next = beat === last ? 0 : beat + 1;
    goTo(next, lengthOf(next));
    schedule();
  }

  return {
    get beat() {
      return beat;
    },
    get running() {
      return timer !== undefined;
    },
    play() {
      if (timer === undefined) schedule();
    },
    pause: stop,
    restart() {
      const wasRunning = timer !== undefined;
      stop();
      goTo(0, lengthOf(0));
      if (wasRunning) schedule();
    },
    settle() {
      stop();
      goTo(last, delay);
    },
  };
}
