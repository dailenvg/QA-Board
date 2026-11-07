"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import type { ImportReport } from "@/lib/workspace-client/import-local";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { DiscardButton, ImportActions } from "./ImportActions";
import { ImportStep } from "./ImportStep";
import { keptLine, skippedLines } from "./import-copy";

interface ImportSummaryProps {
  report: ImportReport;
  onDone: () => void;
  onDiscard: () => void;
}

const LIST = staggerGroup(0.04, 0.12);

/** What came in (in the dialog's description), what was left out and why, and whether the local copy is gone. */
export function ImportSummary({ report, onDone, onDiscard }: ImportSummaryProps) {
  const variants = useRevealVariants();
  const lines = skippedLines(report.skipped);
  const titleId = useId();
  return (
    <ImportStep testId="import-done">
      {lines.length > 0 ? (
        <section aria-labelledby={titleId} className="rounded-card bg-card px-4 py-3">
          <h3 id={titleId} className="text-heading font-semibold">
            Left out
          </h3>
          {/* Focusable, so the list can be scrolled from the keyboard once it passes 12rem. */}
          <motion.ul
            variants={LIST}
            initial="hidden"
            animate="visible"
            tabIndex={0}
            aria-labelledby={titleId}
            className="mt-2 flex max-h-48 flex-col gap-2 overflow-y-auto rounded-field text-body text-ink-2"
            data-testid="import-skipped"
          >
            {lines.map((line) => (
              <motion.li key={line} variants={variants} className="flex items-start gap-2">
                <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-muted" />
                <span className="min-w-0 wrap-anywhere">{line}</span>
              </motion.li>
            ))}
          </motion.ul>
        </section>
      ) : null}
      <p className="flex items-start gap-2 text-body text-muted" data-testid="import-kept">
        <Icon name={report.cleared ? "check" : "history"} className="mt-0.5 size-4 shrink-0" />
        {keptLine(report)}
      </p>
      <ImportActions aside={report.cleared ? null : <DiscardButton onClick={onDiscard} />}>
        <Button onClick={onDone} data-autofocus data-testid="import-finish">
          Done
        </Button>
      </ImportActions>
    </ImportStep>
  );
}
