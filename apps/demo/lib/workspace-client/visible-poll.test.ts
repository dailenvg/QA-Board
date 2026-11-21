import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startVisiblePoll, WORKSPACE_POLL_MS, type PageVisibility } from "./visible-poll";

const MINUTE = WORKSPACE_POLL_MS;

/** A page that's shown or hidden on demand, telling its listeners as the browser would. */
function fakePage(visible = true) {
  const listeners = new Set<() => void>();
  const visibility: PageVisibility = {
    isVisible: () => visible,
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
  const set = (next: boolean) => {
    visible = next;
    for (const listener of listeners) listener();
  };
  return { visibility, set, listeners };
}

/** A read that settles when the test says so, recording when it finished. */
function fakeReads() {
  let readAt = Date.now();
  let finish = () => {};
  const refresh = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = () => {
          readAt = Date.now();
          resolve();
        };
      }),
  );
  return {
    refresh,
    lastReadAt: () => readAt,
    finish: () => finish(),
    setReadAt: (at: number) => (readAt = at),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the visible poll", () => {
  it("reads again a minute after the last read, while visible, until stopped", async () => {
    const page = fakePage();
    const reads = fakeReads();
    const stop = startVisiblePoll({ ...reads, visibility: page.visibility });

    await vi.advanceTimersByTimeAsync(MINUTE - 1);
    expect(reads.refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(reads.refresh).toHaveBeenCalledTimes(1);

    reads.finish();
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(reads.refresh).toHaveBeenCalledTimes(2);

    stop();
    reads.finish();
    await vi.advanceTimersByTimeAsync(MINUTE * 3);
    expect(reads.refresh).toHaveBeenCalledTimes(2);
    expect(page.listeners.size).toBe(0);
  });

  it("waits from any read, so one on focus pushes the next poll back", async () => {
    const page = fakePage();
    const reads = fakeReads();
    startVisiblePoll({ ...reads, visibility: page.visibility });

    await vi.advanceTimersByTimeAsync(MINUTE / 2);
    reads.setReadAt(Date.now());
    await vi.advanceTimersByTimeAsync(MINUTE / 2);
    expect(reads.refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(MINUTE / 2);
    expect(reads.refresh).toHaveBeenCalledTimes(1);
  });

  it("never starts a read while its last one is still on its way", async () => {
    const page = fakePage();
    const reads = fakeReads();
    startVisiblePoll({ ...reads, visibility: page.visibility });

    await vi.advanceTimersByTimeAsync(MINUTE * 5);
    expect(reads.refresh).toHaveBeenCalledTimes(1);
    // Shown again meanwhile: still the one read.
    page.set(true);
    expect(reads.refresh).toHaveBeenCalledTimes(1);

    reads.finish();
    await vi.advanceTimersByTimeAsync(MINUTE - 1);
    expect(reads.refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(reads.refresh).toHaveBeenCalledTimes(2);
  });

  it("pauses while hidden, and reads at once when shown with one due", async () => {
    const page = fakePage();
    const reads = fakeReads();
    startVisiblePoll({ ...reads, visibility: page.visibility });

    page.set(false);
    await vi.advanceTimersByTimeAsync(MINUTE * 10);
    expect(reads.refresh).not.toHaveBeenCalled();

    page.set(true);
    expect(reads.refresh).toHaveBeenCalledTimes(1);
  });

  it("shown again before one is due, waits out the rest of the minute", async () => {
    const page = fakePage();
    const reads = fakeReads();
    startVisiblePoll({ ...reads, visibility: page.visibility });

    await vi.advanceTimersByTimeAsync(MINUTE / 4);
    page.set(false);
    await vi.advanceTimersByTimeAsync(MINUTE / 4);
    page.set(true);
    expect(reads.refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(MINUTE / 2 - 1);
    expect(reads.refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(reads.refresh).toHaveBeenCalledTimes(1);
  });

  it("starting hidden, waits until shown", async () => {
    const page = fakePage(false);
    const reads = fakeReads();
    startVisiblePoll({ ...reads, visibility: page.visibility });

    await vi.advanceTimersByTimeAsync(MINUTE * 2);
    expect(reads.refresh).not.toHaveBeenCalled();
    page.set(true);
    expect(reads.refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps to the minute when a read fails or never lands", async () => {
    const page = fakePage();
    const refresh = vi.fn(() => Promise.reject(new Error("offline")));
    // Nothing ever reads: the last read stays at the start.
    startVisiblePoll({ refresh, lastReadAt: () => 0, visibility: page.visibility });

    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MINUTE - 1);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
