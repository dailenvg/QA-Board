"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { requestSweep } from "@/lib/admin/storage-client";
import type { ExpiryReport } from "@/lib/cron/expiry-steps";
import { useSwapVariants } from "@/lib/motion";
import { FormAlert } from "../auth/FormAlert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { ADMIN_COPY } from "./admin-copy";
import { orphanCheckError } from "./OrphanCheckCard";
import { OrphanTallies, OrphanTalliesSkeleton } from "./OrphanTallies";
import { SweepResult } from "./SweepResult";
import { useOrphanCheck, type OrphanCheck } from "./use-orphan-check";

const COPY = ADMIN_COPY.storage.sweep.dialog;

type Phase =
  | { kind: "confirm"; running: boolean; error: string | null }
  | { kind: "done"; report: ExpiryReport };

/** The dry run's counts in the dialog: the rows while they come, then the counts, or a retry. */
function OrphanPreview({ state, onRetry }: { state: OrphanCheck; onRetry: () => void }) {
  if (state.kind === "ready") return <OrphanTallies report={state.report} />;
  if (state.kind === "failed") {
    return (
      <div className="flex flex-col gap-3">
        <FormAlert
          message={state.error === "failed" ? COPY.checkFailed : orphanCheckError(state.error)}
          tone="note"
          testId="sweep-check-error"
        />
        <Button variant="secondary" size="sm" onClick={onRetry} className="self-start">
          <Icon name="refresh" className="size-5" />
          {COPY.checkAgain}
        </Button>
      </div>
    );
  }
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{COPY.checking}</span>
      <OrphanTalliesSkeleton />
    </div>
  );
}

interface SweepDialogProps {
  open: boolean;
  onClose: () => void;
  /** The run finished (however it ended): the page reads the server again. */
  onSwept: () => void;
}

/**
 * Asks before running the whole daily cleanup now (decision 5): what it
 * deletes, and the orphaned files it would, counted as it opens (a dry run,
 * deleting nothing). Stays up while it runs; then shows what it did, with
 * Done. A failure shows in it, and confirming tries again. Cancel is focused
 * first.
 */
export function SweepDialog({ open, onClose, onSwept }: SweepDialogProps) {
  const orphans = useOrphanCheck({ kind: "checking" });
  const [phase, setPhase] = useState<Phase>({ kind: "confirm", running: false, error: null });
  const running = phase.kind === "confirm" && phase.running;
  const swap = useSwapVariants();
  const { check } = orphans;

  // Each opening counts afresh (the dialog is keyed per opening by its caller).
  useEffect(() => {
    void check();
  }, [check]);

  const run = async () => {
    if (running) return;
    setPhase({ kind: "confirm", running: true, error: null });
    const outcome = await requestSweep();
    if (!outcome.ok) {
      setPhase({
        kind: "confirm",
        running: false,
        error: ADMIN_COPY.storage.errors[outcome.error],
      });
      return;
    }
    setPhase({ kind: "done", report: outcome.value });
    onSwept();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={COPY.title}
      description={phase.kind === "confirm" ? COPY.description : undefined}
      size="sm"
      dismissible={!running}
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
            <SweepResult report={phase.report} />
            <DoneButton onDone={onClose} />
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
            <div>
              <FormAlert message={phase.error} className="has-[p]:mb-4" testId="sweep-error" />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="secondary"
                  onClick={running ? undefined : onClose}
                  aria-disabled={running || undefined}
                  data-autofocus
                >
                  {COPY.cancel}
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
    </Dialog>
  );
}

/** Done, focused as the result appears, so the keyboard lands on the way out. */
function DoneButton({ onDone }: { onDone: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  return (
    <Button
      ref={button}
      onClick={onDone}
      className="self-end max-sm:self-stretch"
      data-testid="sweep-done"
    >
      {COPY.done}
    </Button>
  );
}
