import { describe, expect, it } from "vitest";
import type { Result } from "../store/store";
import { createLatestSaves } from "./latest-saves";

/** A save whose answer the test gives, when it chooses. */
function pending() {
  let answer: (result: Result) => void = () => {};
  const promise = new Promise<Result>((resolve) => {
    answer = resolve;
  });
  return {
    send: () => promise,
    succeed: () => answer({ ok: true, value: undefined }),
    fail: (error: string) => answer({ ok: false, error }),
  };
}

/** Windows in hours; 72 is what the server had before the burst. */
function burst() {
  const saves = createLatestSaves<number | null>();
  const a = pending();
  const b = pending();
  const first = saves.save(72, 24, a.send);
  const second = saves.save(24, 168, b.send);
  return { saves, a, b, first, second };
}

describe("overlapping window saves", () => {
  it("keeps the newer choice when the older save fails after the newer one succeeded", async () => {
    const { a, b, first, second } = burst();
    b.succeed();
    expect(await second).toBeNull();
    a.fail("refused A");
    expect(await first).toEqual({ value: 168, error: null });
  });

  it("keeps the newer choice when the older save fails first", async () => {
    const { a, b, first, second } = burst();
    a.fail("refused A");
    expect(await first).toBeNull();
    b.succeed();
    expect(await second).toEqual({ value: 168, error: null });
  });

  it("falls back to the older confirmed choice when only the newer one is refused", async () => {
    const { a, b, first, second } = burst();
    b.fail("refused B");
    expect(await second).toBeNull();
    a.succeed();
    expect(await first).toEqual({ value: 24, error: "refused B" });
  });

  it("falls back to what the server had when both are refused, saying why the newest was", async () => {
    const { a, b, first, second } = burst();
    a.fail("refused A");
    b.fail("refused B");
    expect(await first).toBeNull();
    expect(await second).toEqual({ value: 72, error: "refused B" });
  });

  it("starts each burst from what the server has then", async () => {
    const { saves, a, b, second } = burst();
    a.succeed();
    b.succeed();
    expect(await second).toEqual({ value: 168, error: null });
    const c = pending();
    const third = saves.save(168, null, c.send);
    c.fail("refused C");
    expect(await third).toEqual({ value: 168, error: "refused C" });
  });

  it("counts a save that throws as refused, so the burst still ends", async () => {
    const saves = createLatestSaves<number | null>();
    const settled = await saves.save(72, 24, () => Promise.reject(new Error("offline")));
    expect(settled?.value).toBe(72);
    expect(settled?.error).toMatch(/didn't save/);
  });
});
