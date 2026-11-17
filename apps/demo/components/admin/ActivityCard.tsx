"use client";

import { motion } from "motion/react";
import type { AdminActivity } from "@/lib/admin/overview";
import { DAY_MS, utcDay } from "@/lib/admin/utc-format";
import { revealViewport, staggerGroup, useRevealVariants } from "@/lib/motion";
import { SettingsCard } from "../account/SettingsCard";
import { TileEmpty } from "../overview/bento/TileEmpty";
import { ADMIN_COPY, entryCount } from "./admin-copy";
import { Sparkline } from "./Sparkline";

const COPY = ADMIN_COPY.overview.activity;

const GROUP = staggerGroup();

/** The busiest day's date, or null when every day is empty. */
function peakDay(perDay: readonly number[], firstDay: number): string | null {
  const peak = Math.max(0, ...perDay);
  if (peak === 0) return null;
  return utcDay(firstDay + perDay.indexOf(peak) * DAY_MS);
}

/**
 * The audit log over the last 30 days: every entry per day as one line, then
 * each kind of change with its own small line and total. Empty: says what
 * will show up.
 */
export function ActivityCard({ activity }: { activity: AdminActivity }) {
  const variants = useRevealVariants();
  const { firstDay, perDay, total, categories } = activity;
  return (
    <SettingsCard
      title={COPY.title}
      description={COPY.description}
      icon="history"
      testId="admin-activity"
    >
      {total === 0 ? (
        <TileEmpty title={COPY.emptyTitle} scene="caughtUp">
          {COPY.emptyBody}
        </TileEmpty>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-body text-muted" data-testid="admin-activity-total">
              {COPY.total(total)}
            </p>
            <Sparkline
              values={perDay}
              label={COPY.chart(COPY.allLabel, total, peakDay(perDay, firstDay))}
              testId="admin-activity-chart"
            />
            <div className="flex justify-between text-label text-muted" aria-hidden="true">
              <span>{utcDay(firstDay)}</span>
              <span>{COPY.today}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-body font-semibold">{COPY.byCategory}</h3>
            <motion.ul
              variants={GROUP}
              initial="hidden"
              whileInView="visible"
              viewport={revealViewport}
              className="flex flex-col divide-y divide-line"
              data-testid="admin-activity-categories"
            >
              {categories.map(({ category, perDay: series, total: count }) => (
                <motion.li
                  key={category}
                  variants={variants}
                  data-category={category}
                  className="flex min-h-11 items-center gap-3 py-2"
                >
                  {/*
                    Phones: the name takes the room. Wider: a fixed name column and the line
                    takes the rest, so each kind's line sits by its name, long enough to read
                    day by day, not a short line far off at the card's edge.
                  */}
                  <span className="min-w-0 flex-1 text-body text-pretty sm:w-48 sm:flex-none">
                    {ADMIN_COPY.categories[category]}
                  </span>
                  <Sparkline
                    values={series}
                    size="sm"
                    label={COPY.chart(
                      ADMIN_COPY.categories[category],
                      count,
                      peakDay(series, firstDay),
                    )}
                  />
                  <span className="w-24 shrink-0 text-right text-meta text-muted tabular-nums">
                    {entryCount(count)}
                  </span>
                </motion.li>
              ))}
            </motion.ul>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}
