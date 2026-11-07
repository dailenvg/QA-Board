"use client";

import { motion, useReducedMotion } from "motion/react";
import { instant, spring } from "@/lib/motion";
import type { ImportProgress } from "@/lib/workspace-client/import-local";
import { ImportStep } from "./ImportStep";
import { progressFraction, progressLine } from "./import-copy";

/** The import under way: a bar, and a status line screen readers hear as it changes. */
export function ImportProgressView({ progress }: { progress: ImportProgress | null }) {
  const reduce = useReducedMotion();
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
      <p role="status" className="text-body text-muted" data-testid="import-status">
        {progressLine(progress)}
      </p>
    </ImportStep>
  );
}
