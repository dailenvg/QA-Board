"use client";

import { formatBytes } from "@/lib/account/storage-level";
import type { OrphanReport } from "@/lib/admin/orphans";
import { utcDateTime } from "@/lib/admin/utc-format";
import type { OrphanTally } from "@/lib/share/orphan-blobs";
import { FormAlert } from "../auth/FormAlert";
import { Skeleton } from "../ui/Skeleton";
import { ADMIN_COPY } from "./admin-copy";
import { RevealItem } from "./RevealItem";

const COPY = ADMIN_COPY.storage.orphans;

/** The report's categories, in the order they're listed. */
const CATEGORIES = ["shareFiles", "workspaceRows", "unrecordedFiles"] as const;

/** A category's count in words: none, its files and bytes, or that it doesn't apply here. */
function tallyText(tally: OrphanTally | null): { text: string; quiet: boolean } {
  if (!tally) return { text: COPY.notApplicable, quiet: true };
  if (tally.files === 0) return { text: COPY.none, quiet: true };
  const bytes = tally.bytes === null ? null : formatBytes(tally.bytes);
  return { text: COPY.tally(tally.files, bytes), quiet: false };
}

/**
 * What an orphan check found: each kind of orphaned file with its count and
 * bytes, whether the check got through every file, and when it ran.
 */
export function OrphanTallies({ report }: { report: OrphanReport }) {
  return (
    <div
      className="flex flex-col gap-4"
      data-testid="orphan-report"
      data-complete={report.complete}
    >
      <ul className="flex flex-col divide-y divide-line">
        {CATEGORIES.map((category, index) => {
          const { text, quiet } = tallyText(report[category]);
          return (
            <RevealItem
              key={category}
              order={index}
              testId={`orphan-${category}`}
              className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
            >
              <span className="min-w-0 text-body text-ink">{COPY.categories[category]}</span>
              <span
                className={`shrink-0 text-body tabular-nums ${quiet ? "text-muted" : "font-semibold text-ink"}`}
                data-testid="orphan-tally"
              >
                {text}
              </span>
            </RevealItem>
          );
        })}
      </ul>
      {report.complete ? null : (
        <FormAlert message={COPY.partial} tone="note" testId="orphan-partial" />
      )}
      <p className="text-meta text-muted">
        <time dateTime={new Date(report.checkedAt).toISOString()}>
          {COPY.checkedAt(utcDateTime(report.checkedAt))}
        </time>
      </p>
    </div>
  );
}

/** An orphan check on its way: the three categories' rows, in their places. */
export function OrphanTalliesSkeleton() {
  return (
    <div className="flex flex-col divide-y divide-line" data-testid="orphan-checking">
      {CATEGORIES.map((category) => (
        <div
          key={category}
          className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:justify-between"
        >
          <Skeleton className="h-4 w-64 max-w-full" />
          <Skeleton className="h-4 w-28" />
        </div>
      ))}
    </div>
  );
}
