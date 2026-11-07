import { afterEach, describe, expect, it, vi } from "vitest";
import { openTabSync } from "./tab-sync";

/** Channels by name, delivering to every other open channel of the name, like the browser's. */
class FakeChannel {
  static open = new Set<FakeChannel>();
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(readonly name: string) {
    FakeChannel.open.add(this);
  }
  postMessage(data: unknown) {
    for (const other of FakeChannel.open) {
      if (other !== this && other.name === this.name) other.onmessage?.({ data } as MessageEvent);
    }
  }
  close() {
    FakeChannel.open.delete(this);
  }
}

afterEach(() => {
  FakeChannel.open.clear();
  vi.unstubAllGlobals();
});

describe("tab sync", () => {
  it("nudges this workspace's other tabs only, until closed", () => {
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    const heard = { same: 0, other: 0, self: 0 };
    const self = openTabSync("w1", () => (heard.self += 1));
    const same = openTabSync("w1", () => (heard.same += 1));
    openTabSync("w2", () => (heard.other += 1));

    self.announce();
    same.close();
    self.announce();
    expect(heard).toEqual({ same: 1, other: 0, self: 0 });
  });

  it("does nothing where BroadcastChannel is missing", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const sync = openTabSync("w1", () => {
      throw new Error("never");
    });
    expect(() => sync.announce()).not.toThrow();
  });
});
