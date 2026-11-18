/**
 * A run started here, whose dialog may be closed: none to show (`idle`), one
 * going on, one that finished while its dialog was closed (its dialog opens
 * again on the result), or one that failed then (the tile says why, and its
 * button asks afresh, as the dialog would).
 */
export type SweepTileRun =
  { kind: "idle" } | { kind: "running" } | { kind: "ended" } | { kind: "failed"; error: string };

export const SWEEP_IDLE: SweepTileRun = { kind: "idle" };
export const SWEEP_RUNNING: SweepTileRun = { kind: "running" };

/**
 * Where a run that just ended leaves the tile: nothing to show if its dialog
 * is open (it shows the outcome itself), else the result to see, or why it
 * failed (`error`, in words).
 */
export function sweepRunEnded(dialogOpen: boolean, error: string | null): SweepTileRun {
  if (dialogOpen) return SWEEP_IDLE;
  return error === null ? { kind: "ended" } : { kind: "failed", error };
}

/** Where closing the dialog leaves the tile: a run going on still is; else nothing to show. */
export function sweepDialogClosed(run: SweepTileRun): SweepTileRun {
  return run.kind === "running" ? run : SWEEP_IDLE;
}

/** Whether Run sweep opens a fresh dialog, asking afresh, rather than the run's own. */
export function opensFreshSweep(run: SweepTileRun): boolean {
  return run.kind === "idle" || run.kind === "failed";
}
