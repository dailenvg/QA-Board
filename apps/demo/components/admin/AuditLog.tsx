"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useOptimistic, useRef, useState, useTransition } from "react";
import { auditHref, type AuditFilters as Filters } from "@/lib/admin/audit-href";
import type { AuditFilterOptions, AuditPage } from "@/lib/admin/audit-query";
import { utcDateTime } from "@/lib/admin/utc-format";
import { duration } from "@/lib/motion";
import { SettingsCard } from "../account/SettingsCard";
import { TileEmpty } from "../overview/bento/TileEmpty";
import { Button } from "../ui/Button";
import { ButtonLink } from "../ui/ButtonLink";
import { ADMIN_COPY } from "./admin-copy";
import { AuditEntryItem } from "./AuditEntryItem";
import { AuditFilters } from "./AuditFilters";
import { AuditPager } from "./AuditPager";

const COPY = ADMIN_COPY.audit;

/** The list while a new page loads: dimmed, but muted text keeps near 3:1. */
const PENDING_OPACITY = 0.7;

interface AuditLogProps {
  filters: Filters;
  /** A page other than the newest is open (the URL has a cursor). */
  paged: boolean;
  page: AuditPage;
  options: AuditFilterOptions;
}

function isFiltered(filters: Filters): boolean {
  return Boolean(filters.workspace || filters.actor || filters.action);
}

/** What the live region says once a new page is in: how many it shows, or why none. */
function resultMessage(page: AuditPage, filters: Filters, paged: boolean): string {
  const newest = page.entries[0];
  if (newest) return COPY.status.shown(page.entries.length, utcDateTime(newest.at));
  if (paged) return COPY.status.end;
  return isFiltered(filters) ? COPY.status.noMatch : COPY.status.empty;
}

/** Nothing to list: none yet, none matching the filters, or nothing past a cursor. */
function AuditEmpty({
  filters,
  paged,
  onClear,
}: {
  filters: Filters;
  paged: boolean;
  onClear: () => void;
}) {
  if (paged) {
    return (
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <TileEmpty title={COPY.endTitle} scene="caughtUp">
          {COPY.endBody}
        </TileEmpty>
        {/* The same filters, from the newest page: only the cursor goes. */}
        <ButtonLink href={auditHref(filters)} variant="secondary" className="self-start">
          {COPY.newest}
        </ButtonLink>
      </div>
    );
  }
  if (isFiltered(filters)) {
    return (
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <TileEmpty title={COPY.noMatchTitle} scene="noMatch">
          {COPY.noMatchBody}
        </TileEmpty>
        <Button variant="secondary" onClick={onClear} className="self-start">
          {COPY.clear}
        </Button>
      </div>
    );
  }
  return (
    <div className="p-5 sm:p-6">
      <TileEmpty title={COPY.emptyTitle} scene="caughtUp">
        {COPY.emptyBody}
      </TileEmpty>
    </div>
  );
}

/**
 * The audit log: its filters, then a page of entries, newest first, with
 * Newer and Older. Every change is a new URL, opened in a transition: the
 * list dims and says it's busy until the new page is in.
 */
export function AuditLog({ filters, paged, page, options }: AuditLogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // The selects show a new choice at once, not the old one until the new page is in.
  const [shownFilters, showFilters] = useOptimistic(filters);
  const filtersId = useId();
  const entries = useRef<HTMLElement>(null);
  const focusEntries = useRef(false);
  // Silent on arrival; set in the same transition as a change, so it speaks with the new page.
  const [announce, setAnnounce] = useState(false);
  const applyFilters = (next: Filters) =>
    startTransition(() => {
      showFilters(next);
      setAnnounce(true);
      router.push(auditHref(next), { scroll: false });
    });
  // Clear filters unmounts the button pressed: focus goes to the first filter, not the page.
  const clearFilters = () => {
    applyFilters({});
    document.getElementById(`${filtersId}-workspace`)?.focus();
  };
  // Newer or Older can vanish under focus (first or last page): the new entries take focus.
  const turnPage = (href: string) => {
    focusEntries.current = true;
    startTransition(() => {
      setAnnounce(true);
      router.push(href);
    });
  };
  const listKey = `${auditHref(filters)}#${page.entries[0]?.cursor ?? "none"}`;
  useEffect(() => {
    if (!focusEntries.current) return;
    focusEntries.current = false;
    entries.current?.focus({ preventScroll: true });
  }, [listKey]);
  return (
    <div className="flex flex-col gap-4" data-testid="audit-log">
      <SettingsCard title={COPY.title} description={COPY.description} icon="history">
        <AuditFilters
          idBase={filtersId}
          filters={shownFilters}
          options={options}
          onChange={applyFilters}
          onClear={clearFilters}
        />
      </SettingsCard>
      <motion.section
        ref={entries}
        tabIndex={-1}
        aria-label={COPY.entries}
        aria-busy={pending || undefined}
        animate={{ opacity: pending ? PENDING_OPACITY : 1 }}
        transition={{ duration: duration.micro }}
        className="flex flex-col overflow-hidden rounded-card bg-card shadow-seg"
      >
        {page.entries.length === 0 ? (
          <AuditEmpty filters={filters} paged={paged} onClear={clearFilters} />
        ) : (
          <ol
            key={listKey}
            className="flex flex-col divide-y divide-line"
            data-testid="audit-entries"
          >
            {page.entries.map((entry, index) => (
              <AuditEntryItem key={entry.id} entry={entry} order={index} />
            ))}
          </ol>
        )}
      </motion.section>
      <p role="status" aria-live="polite" className="sr-only" data-testid="audit-status">
        {announce ? resultMessage(page, filters, paged) : ""}
      </p>
      <AuditPager
        newerHref={page.newer ? auditHref(filters, { after: page.newer }) : null}
        olderHref={page.older ? auditHref(filters, { before: page.older }) : null}
        onNavigate={turnPage}
      />
    </div>
  );
}
