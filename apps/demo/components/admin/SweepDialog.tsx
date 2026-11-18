"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { requestSweep } from "@/lib/admin/storage-client";
import type { ExpiryReport } from "@/lib/cron/expiry-steps";
import { usePopVariants, useSwapVariants } from "@/lib/motion";
import { FormAlert } from "../auth/FormAlert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { ADMIN_COPY } from "./admin-copy";
import { indeterminate } from "./admin-motion";
import { orphanCheckError } from "./OrphanCheckCard";
import { OrphanTallies, OrphanTalliesSkeleton, orphanSummary } from "./OrphanTallies";
import { SweepResult } from "./SweepResult";
import { useOrphanCheck, type OrphanCheck } from "./use-orphan-check";

const COPY = ADMIN_COPY.storage.sweep.dialog;

/** How often the running time under the progress bar moves on. */
const TICK_MS = 1000;

type Phase =
  | { kind: "confirm"; error: string | null }
  | { kind: "running"; startedAt: number }
  | { kind: "done"; report: ExpiryReport };

/** Why the dry run couldn't count, in words. */
function checkError(state: Extract<OrphanCheck, { kind: "failed" }>): string {
  return state.error === "failed" ? COPY.checkFailed : orphanCheckError(state.error);
}

/** The dry run's counts in the dialog: the rows while they come, then the counts, or a retry. */
function OrphanPreview({ state, onRetry }: { state: OrphanCheck; onRetry: () => void }) {
  if (state.kind === "ready") return <OrphanTallies report={state.report} />;
  if (state.kind === "failed") {
    return (
      <div className="flex flex-col gap-3">
        <FormAlert message={checkError(state)} tone="note" testId="sweep-check-error" />
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          className="self-start max-sm:self-stretch"
        >
          <Icon name="refresh" className="size-5" />
          {COPY.checkAgain}
        </Button>
      </div>
    );
  }
  return (
    <div aria-busy="true">
      <OrphanTalliesSkeleton />
    </div>
  );
}

/**
 * What the dialog's live region reads out: that it's running; else the dry
 * run's progress and counts. Nothing once there's a result (Done, focused,
 * is described by it) or a failure (its own alert reads it).
 */
function announcement(phase: Phase, orphans: OrphanCheck): string {
  if (phase.kind === "running") return COPY.started;
  if (phase.kind === "done" || phase.error) return "";
  if (orphans.kind === "checking") return COPY.checking;
  if (orphans.kind === "ready") return orphanSummary(orphans.report);
  return orphans.kind === "failed" ? checkError(orphans) : "";
}

/**
 * While it runs: a bar that keeps moving (no figure to fill it to: the run
 * doesn't report how far along it is) and how long it's been running, which
 * stays right when the dialog is closed and opened again. Not a live region:
 * the time would be read out every second.
 */
function SweepProgress({ startedAt }: { startedAt: number }) {
  const reduce = useReducedMotion();
  const pop = usePopVariants();
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, TICK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [startedAt]);

  return (
    <motion.div
      variants={pop}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex flex-col gap-2"
      data-testid="sweep-progress"
    >
      {reduce ? null : (
        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-pill bg-line-strong">
          <motion.div
            variants={indeterminate}
            initial="from"
            animate="to"
            className="h-full w-1/3 rounded-pill bg-brand-text"
          />
        </div>
      )}
      <p className="text-meta text-pretty text-muted tabular-nums">{COPY.progress(seconds)}</p>
    </motion.div>
  );
}

interface SweepDialogProps {
  open: boolean;
  onClose: () => void;
  /** The run finished: the page reads the server again. */
  onSwept: () => void;
  /**
   * A run started (true) or ended, however it ended (false, with why in words
   * when it failed), so the page can say so.
   */
  onRunning: (running: boolean, error?: string) => void;
}

/**
 * Asks before running the whole daily cleanup now (decision 5): what it
 * deletes, and the orphaned files it would, counted as it opens (a dry run,
 * deleting nothing). While it runs (up to a minute), a moving bar and the
 * time so far; closing it then is safe, as the run goes on (on the server,
 * and here, so the page still updates), and its caller opens this same
 * dialog again to see it. Then what it did, with Done. A failure shows in
 * it, and confirming tries again. Cancel is focused first.
 */
export function SweepDialog({ open, onClose, onSwept, onRunning }: SweepDialogProps) {
  const orphans = useOrphanCheck({ kind: "checking" });
  const [phase, setPhase] = useState<Phase>({ kind: "confirm", error: null });
  const running = phase.kind === "running";
  const swap = useSwapVariants();
  const resultId = useId();
  const { check } = orphans;

  // Each opening counts afresh (the dialog is keyed per opening by its caller).
  useEffect(() => {
    void check();
  }, [check]);

  const run = async () => {
    if (running) return;
    setPhase({ kind: "running", startedAt: Date.now() });
    onRunning(true);
    const outcome = await requestSweep();
    if (!outcome.ok) {
      const error = ADMIN_COPY.storage.errors[outcome.error];
      onRunning(false, error);
      setPhase({ kind: "confirm", error });
      return;
    }
    onRunning(false);
    setPhase({ kind: "done", report: outcome.value });
    onSwept();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={COPY.title}
      description={phase.kind === "done" ? undefined : COPY.description}
      size="md"
      testId="sweep-dialog"
    >
      <AnimatePresence mode="wait" initial={false}>
        {phase.kind === "done" ? (
          <motion.div
            key="done"
            variants={swap}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col gap-5"
          >
            <SweepResult report={phase.report} id={resultId} />
            <DoneButton onDone={onClose} describedBy={resultId} />
          </motion.div>
        ) : (
          <motion.div
            key="confirm"
            variants={swap}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col gap-5"
            aria-busy={running || undefined}
          >
            <section aria-labelledby="sweep-orphans" className="flex flex-col gap-3">
              <h3 id="sweep-orphans" className="text-body font-semibold">
                {COPY.orphans}
              </h3>
              <OrphanPreview state={orphans.state} onRetry={() => void check()} />
            </section>
            {/* No entrance when the dialog opens again on a run already going. */}
            <AnimatePresence initial={false}>
              {phase.kind === "running" ? (
                <SweepProgress key="progress" startedAt={phase.startedAt} />
              ) : null}
            </AnimatePresence>
            <div>
              <FormAlert
                message={phase.kind === "confirm" ? phase.error : null}
                className="has-[p]:mb-4"
                testId="sweep-error"
              />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                {/* While it runs, Close: it closes the dialog, not the run. */}
                <Button variant="secondary" onClick={onClose} data-autofocus>
                  {running ? COPY.close : COPY.cancel}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => void run()}
                  aria-disabled={running || undefined}
                  data-testid="sweep-confirm"
                >
                  <Icon name="broom" className="size-5" />
                  {running ? COPY.pending : COPY.confirm}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Outside the swapped views, so it's in place before its words change. */}
      <p role="status" className="sr-only">
        {announcement(phase, orphans.state)}
      </p>
    </Dialog>
  );
}

/**
 * Done, focused as the result appears (focus was on the run's button, now
 * gone, or elsewhere in the dialog), and described by the result so screen
 * readers hear it. Opened again on a result (a run that ended while it was
 * closed), the dialog focuses it itself (`data-autofocus`) after noting the
 * page's button to return focus to; taking focus first would lose that.
 */
function DoneButton({ onDone, describedBy }: { onDone: () => void; describedBy: string }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const node = button.current;
    const active = document.activeElement;
    const inDialog = node?.closest('[role="dialog"]')?.contains(active) ?? false;
    if (!active || active === document.body || inDialog) node?.focus();
  }, []);
  return (
    <Button
      ref={button}
      onClick={onDone}
      aria-describedby={describedBy}
      className="self-end max-sm:self-stretch"
      data-autofocus
      data-testid="sweep-done"
    >
      {COPY.done}
    </Button>
  );
}
