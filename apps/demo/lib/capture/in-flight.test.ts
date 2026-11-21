import { describe, expect, it, vi } from "vitest";
import { captureKey, createInFlight, unlessAborted } from "./in-flight";

/** A promise to settle by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const KEY = captureKey("p1", "https://acme.example/", 1440);

describe("work in flight", () => {
  it("joins a run under way instead of starting another", async () => {
    const inFlight = createInFlight<string>();
    const run = deferred<string>();
    const start = vi.fn(() => run.promise);
    const first = inFlight.run(KEY, start);
    const second = inFlight.run(KEY, start);
    expect(inFlight.join(KEY)).toBe(first);
    run.resolve("snapshot");
    expect(await second).toBe("snapshot");
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("keeps runs under other keys apart", () => {
    const inFlight = createInFlight<string>();
    void inFlight.run(KEY, () => new Promise(() => undefined));
    expect(inFlight.join(captureKey("p1", "https://acme.example/", 390))).toBeNull();
    expect(inFlight.join(captureKey("p2", "https://acme.example/", 1440))).toBeNull();
  });

  it("forgets a run once it lands, so the next one starts fresh", async () => {
    const inFlight = createInFlight<string>();
    await inFlight.run(KEY, () => Promise.resolve("first"));
    expect(inFlight.join(KEY)).toBeNull();
    const start = vi.fn(() => Promise.resolve("second"));
    expect(await inFlight.run(KEY, start)).toBe("second");
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("forgets a run that failed, and its joiners hear the failure", async () => {
    const inFlight = createInFlight<string>();
    const run = deferred<string>();
    const first = inFlight.run(KEY, () => run.promise);
    const joined = inFlight.join(KEY);
    run.reject(new Error("offline"));
    await expect(first).rejects.toThrow("offline");
    await expect(joined).rejects.toThrow("offline");
    expect(inFlight.join(KEY)).toBeNull();
  });
});

describe("waiting on a run until leaving", () => {
  it("gives the run's outcome", async () => {
    expect(await unlessAborted(Promise.resolve("snapshot"), new AbortController().signal)).toBe(
      "snapshot",
    );
  });

  it("gives null as soon as the caller leaves, while the run carries on", async () => {
    const run = deferred<string>();
    const controller = new AbortController();
    const waiting = unlessAborted(run.promise, controller.signal);
    controller.abort();
    expect(await waiting).toBeNull();
    run.resolve("snapshot");
    expect(await run.promise).toBe("snapshot");
  });

  it("gives null at once to a caller that already left", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await unlessAborted(new Promise(() => undefined), controller.signal)).toBeNull();
  });

  it("passes a failure on", async () => {
    const waiting = unlessAborted(
      Promise.reject(new Error("offline")),
      new AbortController().signal,
    );
    await expect(waiting).rejects.toThrow("offline");
  });
});
