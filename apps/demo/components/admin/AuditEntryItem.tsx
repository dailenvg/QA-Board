"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import type { AuditDetails } from "@/lib/admin/audit-details";
import type { AuditRow } from "@/lib/admin/audit-query";
import { utcDateTime } from "@/lib/admin/utc-format";
import { duration, ease, revealViewport, rise, staggerStep } from "@/lib/motion";
import { ADMIN_COPY, actionLabel, TARGET_LABELS } from "./admin-copy";

const COPY = ADMIN_COPY.audit;
const DETAILS = ADMIN_COPY.details;

/** Rows past this many on screen at once rise in together, not one by one. */
const STAGGERED = 8;

/** `fadeUp`'s rise, each row a stagger step after the one before it (up to `STAGGERED`). */
const rowVariants: Variants = {
  hidden: { opacity: 0, y: rise },
  visible: (order: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: duration.component,
      ease: ease.out,
      delay: Math.min(order, STAGGERED) * staggerStep,
    },
  }),
};

/** The entry's safe details in words: never more than `auditDetails` kept. */
function detailLines(details: AuditDetails): string[] {
  return [
    ...(details.fields.length > 0 ? [DETAILS.fields(details.fields)] : []),
    ...(details.reviewWindow ? [DETAILS.reviewWindow(details.reviewWindow)] : []),
    ...(details.viaInvite ? [DETAILS.viaInvite] : []),
    ...(details.switches
      ? [DETAILS.switches(details.switches.before, details.switches.after)]
      : []),
    ...(details.recipients !== undefined ? [DETAILS.recipients(details.recipients)] : []),
    ...(details.assigned !== undefined ? [DETAILS.assigned(details.assigned)] : []),
  ];
}

function actorLabel({ actor }: AuditRow): string {
  if (!actor) return COPY.squint;
  const who = actor.name ? `${actor.name} (${actor.email})` : actor.email;
  return actor.deleted ? COPY.deletedActor(who) : who;
}

function targetLabel({ target }: AuditRow): string | null {
  if (!target) return null;
  return `${TARGET_LABELS[target.type] ?? target.type}: ${target.label ?? target.id}`;
}

/**
 * One entry: what happened and when; who did it (Squint itself for the cron)
 * and in which workspace (its id once it's gone); what it was done to, and
 * the safe details. Rises in as it comes on screen.
 */
export function AuditEntryItem({ entry, order }: { entry: AuditRow; order: number }) {
  const reduce = useReducedMotion() ?? false;
  const target = targetLabel(entry);
  const details = detailLines(entry.details);
  return (
    <motion.li
      custom={order}
      variants={rowVariants}
      initial={reduce ? false : "hidden"}
      whileInView="visible"
      viewport={revealViewport}
      data-testid="audit-entry"
      data-action={entry.action}
      className="flex min-w-0 flex-col gap-1.5 px-5 py-4 sm:px-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 text-body font-semibold">
          {actionLabel(entry.action)}
          <span className="ml-2 align-baseline text-label font-normal text-muted">
            {entry.action}
          </span>
        </p>
        <time
          dateTime={new Date(entry.at).toISOString()}
          className="text-meta text-muted tabular-nums"
        >
          {utcDateTime(entry.at)}
        </time>
      </div>
      <p className="text-body text-muted wrap-anywhere">
        {COPY.by}{" "}
        <span className="font-medium text-ink" data-testid="audit-actor">
          {actorLabel(entry)}
        </span>
        {entry.workspace ? (
          <>
            {" "}
            {COPY.in}{" "}
            <span className="font-medium text-ink" data-testid="audit-workspace">
              {entry.workspace.name ?? COPY.goneWorkspace(entry.workspace.id)}
            </span>
          </>
        ) : null}
      </p>
      {target || details.length > 0 ? (
        <p className="text-meta text-muted wrap-anywhere">
          {[target, ...details].filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </motion.li>
  );
}
