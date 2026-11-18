"use client";

import type { ReactNode } from "react";
import { utcDateTime } from "@/lib/admin/utc-format";
import type { CronRun, CronRunStatus } from "@/lib/cron/cron-runs";
import { CRON_SCHEDULE } from "@/lib/cron/schedule";
import { SettingsCard } from "../account/SettingsCard";
import { TileEmpty } from "../overview/bento/TileEmpty";
import { Icon, type IconName } from "../ui/Icon";
import { BADGE_SHELL } from "../ui/StatusChip";
import { ADMIN_COPY, runDuration } from "./admin-copy";
import { RevealItem } from "./RevealItem";

const COPY = ADMIN_COPY.system.cron;
const COLUMNS = COPY.columns;

/** Started by, started, took, status; from md up a row, on phones each value named above it. */
const RUN_GRID =
  "md:grid md:grid-cols-[minmax(0,7rem)_minmax(0,1.2fr)_minmax(0,6rem)_minmax(0,1.4fr)] md:items-start md:gap-4";

/** Each status's tint and ink, which meet AA together in both themes, and its icon. */
const LOOK: Record<CronRunStatus, { tone: string; icon: IconName }> = {
  finished: { tone: "bg-ready-soft text-ready-text", icon: "check" },
  partial: { tone: "bg-warning-soft text-warning-text", icon: "clock" },
  failed: { tone: "bg-danger-soft text-danger", icon: "alert" },
  running: { tone: "bg-brand-soft text-brand-text", icon: "refresh" },
  abandoned: { tone: "bg-danger-soft text-danger", icon: "close" },
};

function RunStatus({ run }: { run: CronRun }) {
  const { tone, icon } = LOOK[run.status];
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <span
        data-testid="cron-run-status"
        data-status={run.status}
        className={`${BADGE_SHELL} max-w-full font-semibold ${tone}`}
      >
        <Icon name={icon} className="size-4 shrink-0" />
        <span className="truncate">{COPY.status[run.status]}</span>
      </span>
      {run.failedSteps.length > 0 ? (
        <p className="text-meta text-pretty text-muted" data-testid="cron-run-failed-steps">
          {COPY.failedSteps(run.failedSteps)}
        </p>
      ) : null}
    </div>
  );
}

/** One value with its name: visible above it on phones; read out only from md up. */
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-label text-muted md:sr-only">{label}</p>
      <div className="min-w-0 text-body text-ink">{children}</div>
    </div>
  );
}

function RunRow({ run, order }: { run: CronRun; order: number }) {
  return (
    <RevealItem
      order={order}
      testId="cron-run"
      className={`grid grid-cols-2 gap-3 py-4 first:pt-0 last:pb-0 md:py-3 ${RUN_GRID}`}
    >
      <Cell label={COLUMNS.trigger}>
        <span data-testid="cron-run-trigger">{COPY.trigger[run.trigger]}</span>
      </Cell>
      <Cell label={COLUMNS.started}>
        <time dateTime={new Date(run.startedAt).toISOString()} className="tabular-nums">
          {utcDateTime(run.startedAt)}
        </time>
      </Cell>
      <Cell label={COLUMNS.duration}>
        <span className="tabular-nums">
          {run.finishedAt === null ? COPY.noDuration : runDuration(run.finishedAt - run.startedAt)}
        </span>
      </Cell>
      <Cell label={COLUMNS.status}>
        <RunStatus run={run} />
      </Cell>
    </RevealItem>
  );
}

/** The daily cleanup's latest runs, newest first, or what shows before the first. */
export function CronRunList({ runs, shown }: { runs: readonly CronRun[]; shown: number }) {
  return (
    <SettingsCard
      title={COPY.title}
      description={COPY.description(CRON_SCHEDULE, shown)}
      icon="history"
      testId="system-cron"
    >
      {runs.length === 0 ? (
        <TileEmpty title={COPY.emptyTitle} scene="caughtUp">
          {COPY.emptyBody}
        </TileEmpty>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Hidden from screen readers: each value carries its own name. */}
          <div
            aria-hidden="true"
            className={`hidden border-b border-line pb-2 text-label text-muted ${RUN_GRID}`}
          >
            <span>{COLUMNS.trigger}</span>
            <span>{COLUMNS.started}</span>
            <span>{COLUMNS.duration}</span>
            <span>{COLUMNS.status}</span>
          </div>
          <ol className="flex flex-col divide-y divide-line">
            {runs.map((run, index) => (
              <RunRow key={run.id} run={run} order={index} />
            ))}
          </ol>
        </div>
      )}
    </SettingsCard>
  );
}
