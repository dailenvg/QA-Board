import { describe, expect, it, vi } from "vitest";
import { emitSquiggy, latestSquiggyEvent, onSquiggy } from "./events";

describe("Squiggy events", () => {
  it("tells listeners until they unsubscribe, and remembers the latest event", () => {
    const listener = vi.fn();
    const stop = onSquiggy(listener);
    emitSquiggy({ type: "project-created", projectName: "Site" });
    stop();
    emitSquiggy({ type: "item-deleted", item: "folder" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      event: { type: "project-created", projectName: "Site" },
    });
    expect(latestSquiggyEvent()?.event).toEqual({ type: "item-deleted", item: "folder" });
  });

  it("keeps going when a listener throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const after = vi.fn();
    const stopBad = onSquiggy(() => {
      throw new Error("boom");
    });
    const stopAfter = onSquiggy(after);
    expect(() => emitSquiggy({ type: "save-failed" })).not.toThrow();
    expect(after).toHaveBeenCalledOnce();
    stopBad();
    stopAfter();
  });
});
