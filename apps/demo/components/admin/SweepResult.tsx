"use client";

import { EXPIRY_STEPS, type ExpiryReport } from "@/lib/cron/expiry-steps";
import { FormAlert } from "../auth/FormAlert";
import { ADMIN_COPY, STEP_LABELS } from "./admin-copy";
import { RevealItem } from "./RevealItem";

const COPY = ADMIN_COPY.storage.sweep.result;

/** How the run ended, in one line: failed steps first, then out of time, else finished. */
function Outcome({ report }: { report: ExpiryReport }) {
  const failed = EXPIRY_STEPS.filter((step) => report.failed[step]);
  if (failed.length > 0) return <FormAlert message={COPY.failed(failed)} testId="sweep-outcome" />;
  return (
    <FormAlert
      message={report.done ? COPY.finished : COPY.partial}
      tone={report.done ? "info" : "note"}
      testId="sweep-outcome"
    />
  );
}

/**
 * What a cleanup run did: how it ended, then each step that deleted
 * something with its count, or that nothing was due.
 */
export function SweepResult({ report }: { report: ExpiryReport }) {
  const deleted = EXPIRY_STEPS.filter((step) => (report[step] ?? 0) > 0);
  return (
    <div className="flex flex-col gap-4" data-testid="sweep-result" data-done={report.done}>
      <Outcome report={report} />
      <section aria-labelledby="sweep-deleted" className="flex flex-col gap-2">
        <h3 id="sweep-deleted" className="text-body font-semibold">
          {COPY.deleted}
        </h3>
        {deleted.length === 0 ? (
          <p className="text-body text-muted" data-testid="sweep-nothing">
            {COPY.nothing}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {deleted.map((step, index) => (
              <RevealItem
                key={step}
                order={index}
                testId="sweep-step"
                className="flex items-baseline justify-between gap-4 py-2"
              >
                <span className="min-w-0 text-body text-ink">{STEP_LABELS[step]}</span>
                <span className="shrink-0 text-body font-semibold tabular-nums">
                  {COPY.count(report[step] ?? 0)}
                </span>
              </RevealItem>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
