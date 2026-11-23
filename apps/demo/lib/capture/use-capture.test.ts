import { describe, expect, it } from "vitest";
import type { Snapshot } from "../store/types";
import { CAPTURE_MESSAGES } from "./messages";
import { settledState } from "./use-capture";

const snapshot = { id: "s1" } as Snapshot;
const done = { timedOut: false, aborted: false };

describe("a capture's state once it settles", () => {
  it("notes a partial page, so the snapshot bar can say so", () => {
    expect(settledState({ ok: true, snapshot, partial: true }, done)).toEqual({
      status: "idle",
      partial: { snapshotId: "s1" },
    });
  });

  it("is plain idle after a whole page", () => {
    expect(settledState({ ok: true, snapshot }, done)).toEqual({ status: "idle" });
  });

  it("drops the partial note when the capture was cancelled", () => {
    const outcome = { ok: true as const, snapshot, partial: true as const };
    expect(settledState(outcome, { timedOut: false, aborted: true })).toEqual({ status: "idle" });
    expect(settledState(null, done)).toEqual({ status: "idle" });
  });

  it("fails with the timeout message when the client gave up waiting", () => {
    expect(settledState(null, { timedOut: true, aborted: true })).toEqual({
      status: "failed",
      message: CAPTURE_MESSAGES.timeout,
      failure: "timeout",
    });
  });

  it("fails with the capture's own message", () => {
    const outcome = { ok: false as const, message: "Nope.", failure: "busy" as const };
    expect(settledState(outcome, done)).toEqual({
      status: "failed",
      message: "Nope.",
      failure: "busy",
    });
  });
});
