"use client";

import { motion } from "motion/react";
import { utcDateTime } from "@/lib/admin/utc-format";
import type { CronRun } from "@/lib/cron/cron-runs";
import { CRON_SCHEDULE } from "@/lib/cron/schedule";
import { useRevealVariants } from "@/lib/motion";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ADMIN_COPY } from "./admin-copy";

const COPY = ADMIN_COPY.storage.sweep;

/**
 * A run started here, whose dialog may be closed: none to show (`idle`),
 * one going on, or one that ended while its dialog was closed.
 */
export type SweepTileRun = "idle" | "running" | "ended";

const BUTTON = {
  idle: { label: COPY.run, icon: "broom" },
  running: { label: COPY.seeProgress, icon: "arrow" },
  ended: { label: COPY.seeResult, icon: "arrow" },
} as const;

interface SweepTileProps {
  lastRun: CronRun | null;
  run: SweepTileRun;
  /** Run sweep's dialog: a fresh one, or, with a run to show, that run's. */
  onRun: () => void;
}

/**
 * The daily cleanup beside the Stored tile: when it runs, how its last run
 * went (UTC), and Run sweep. While a run started here goes on with its
 * dialog closed, it says so, and the button reopens the dialog. The line is
 * a live region, so screen readers hear that, then the last run once it's back.
 * Rises in with its group.
 */
export function SweepTile({ lastRun, run, onRun }: SweepTileProps) {
  const variants = useRevealVariants();
  const button = BUTTON[run];
  return (
    <motion.li
      variants={variants}
      data-testid="sweep-tile"
      className="flex min-w-0 flex-col gap-3 rounded-card bg-card p-4 shadow-seg sm:p-5"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-pill bg-brand-soft text-brand-text">
          <Icon name="broom" className="size-4" />
        </span>
        <h3 className="min-w-0 text-body font-semibold text-pretty">{COPY.title}</h3>
      </div>
      <div className="flex flex-col gap-1 text-meta text-pretty">
        <p className="text-muted">{COPY.schedule(CRON_SCHEDULE)}</p>
        <p role="status" className="text-ink-2" data-testid="sweep-last-run">
          {run === "running" ? (
            COPY.runningNow
          ) : lastRun ? (
            <>
              {COPY.lastRun.label}{" "}
              <time dateTime={new Date(lastRun.startedAt).toISOString()}>
                {utcDateTime(lastRun.startedAt)}
              </time>
              {COPY.lastRun.status(ADMIN_COPY.system.cron.status[lastRun.status])}
            </>
          ) : (
            COPY.neverRun
          )}
        </p>
      </div>
      <Button
        variant="secondary"
        onClick={onRun}
        className="mt-auto self-start max-sm:self-stretch"
        data-testid="sweep-run"
      >
        <Icon name={button.icon} className="size-5" />
        {button.label}
      </Button>
    </motion.li>
  );
}
