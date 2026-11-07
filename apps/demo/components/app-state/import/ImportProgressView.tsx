"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { instant, spring } from "@/lib/motion";
import type { ImportProgress } from "@/lib/workspace-client/import-local";
import { ImportStep } from "./ImportStep";
import { progressFraction, progressLine } from "./import-copy";

/**
 * The import under way: a bar and a counting status line. Screen readers hear
 * each stage as it starts (its first line), not every file that follows.
 */
export function ImportProgressView({ progress }: { progress: ImportProgress | null }) {
  const reduce = useReducedMotion();
  const stage = progress?.stage ?? null;
  const [spoken, setSpoken] = useState(() => ({ stage, line: progressLine(progress) }));
  if (spoken.stage !== stage) setSpoken({ stage, line: progressLine(progress) });
  return (
    <ImportStep testId="import-progress">
      <div className="h-2 overflow-hidden rounded-pill bg-seg" aria-hidden="true">
        <motion.div
          className="h-full origin-left rounded-pill bg-brand"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: progressFraction(progress) }}
          transition={reduce ? instant : spring.soft}
        />
      </div>
      <p className="text-body text-muted" data-testid="import-status">
        {progressLine(progress)}
      </p>
      <p role="status" className="sr-only">
        {spoken.line}
      </p>
    </ImportStep>
  );
}
