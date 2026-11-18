import { describe, expect, it } from "vitest";
import {
  opensFreshSweep,
  SWEEP_IDLE,
  SWEEP_RUNNING,
  sweepDialogClosed,
  sweepRunEnded,
} from "./sweep-tile-run";

const ERROR = "Couldn't reach Squint. Check your connection and try again.";

describe("the sweep tile's run", () => {
  it("shows nothing when the run ends with its dialog open: the dialog shows the outcome", () => {
    expect(sweepRunEnded(true, null)).toEqual(SWEEP_IDLE);
    expect(sweepRunEnded(true, ERROR)).toEqual(SWEEP_IDLE);
  });

  it("offers the result of a run that finished with its dialog closed, in that dialog", () => {
    const ended = sweepRunEnded(false, null);
    expect(ended).toEqual({ kind: "ended" });
    expect(opensFreshSweep(ended)).toBe(false);
  });

  it("says why a run failed with its dialog closed, and Run sweep then asks afresh", () => {
    const failed = sweepRunEnded(false, ERROR);
    expect(failed).toEqual({ kind: "failed", error: ERROR });
    expect(opensFreshSweep(failed)).toBe(true);
  });

  it("keeps a run going when its dialog closes, and clears anything else", () => {
    expect(sweepDialogClosed(SWEEP_RUNNING)).toEqual(SWEEP_RUNNING);
    expect(opensFreshSweep(SWEEP_RUNNING)).toBe(false);
    expect(sweepDialogClosed({ kind: "ended" })).toEqual(SWEEP_IDLE);
    expect(sweepDialogClosed({ kind: "failed", error: ERROR })).toEqual(SWEEP_IDLE);
    expect(opensFreshSweep(SWEEP_IDLE)).toBe(true);
  });
});
