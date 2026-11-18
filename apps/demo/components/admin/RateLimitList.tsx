"use client";

import type { RateLimitBackend, RateLimitEntry } from "@/lib/admin/rate-limits";
import { SettingsCard } from "../account/SettingsCard";
import { ADMIN_COPY } from "./admin-copy";
import { RevealItem } from "./RevealItem";

const COPY = ADMIN_COPY.system.rateLimits;

const BACKENDS: readonly RateLimitBackend[] = ["postgres", "memory"];

/** One backend's limits: what each limits, and its rule ("5 per 15 minutes, per email address"). */
function BackendGroup({
  backend,
  limits,
}: {
  backend: RateLimitBackend;
  limits: readonly RateLimitEntry[];
}) {
  const titleId = `rate-limits-${backend}`;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2" data-testid={titleId}>
      <h3 id={titleId} className="text-body font-semibold">
        {COPY.backends[backend]}
      </h3>
      <ul className="flex flex-col divide-y divide-line">
        {limits.map((entry, index) => (
          <RevealItem
            key={entry.id}
            order={index}
            testId="rate-limit"
            className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
          >
            <span className="min-w-0 text-body font-medium text-ink">{COPY.items[entry.id]}</span>
            <span className="text-meta text-ink-2 tabular-nums sm:text-right">
              {COPY.rule(entry.limit, entry.windowMs, entry.per)}
            </span>
          </RevealItem>
        ))}
      </ul>
    </section>
  );
}

/** Every rate limit, those in Postgres first, then the in-memory ones. */
export function RateLimitList({ limits }: { limits: readonly RateLimitEntry[] }) {
  return (
    <SettingsCard
      title={COPY.title}
      description={COPY.description}
      icon="gauge"
      testId="system-rate-limits"
    >
      <div className="flex flex-col gap-6">
        {BACKENDS.map((backend) => (
          <BackendGroup
            key={backend}
            backend={backend}
            limits={limits.filter((entry) => entry.backend === backend)}
          />
        ))}
      </div>
    </SettingsCard>
  );
}
