"use client";

import { motion, useReducedMotion } from "motion/react";
import type { AuditDetails } from "@/lib/admin/audit-details";
import type { AuditRow } from "@/lib/admin/audit-query";
import { utcDateTime } from "@/lib/admin/utc-format";
import { revealViewport, useRevealVariants } from "@/lib/motion";
import { ADMIN_COPY, actionLabel, TARGET_LABELS } from "./admin-copy";
import { rowVariants } from "./admin-motion";

const COPY = ADMIN_COPY.audit;
const DETAILS = ADMIN_COPY.details;

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
  // Reduced motion: a plain fade that also puts back the rise the server may have rendered.
  const reduce = useReducedMotion() ?? false;
  const fade = useRevealVariants();
  const target = targetLabel(entry);
  const details = detailLines(entry.details);
  const label = actionLabel(entry.action);
  return (
    <motion.li
      custom={order}
      variants={reduce ? fade : rowVariants}
      initial="hidden"
      whileInView="visible"
      viewport={revealViewport}
      data-testid="audit-entry"
      data-action={entry.action}
      className="flex min-w-0 flex-col gap-1 px-5 py-4 sm:px-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {/* The raw action code, for the code owner: secondary, and only when it adds something. */}
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-body font-semibold">
          <span className="min-w-0">{label}</span>
          {label !== entry.action ? (
            <code className="min-w-0 font-mono text-label font-normal text-muted wrap-anywhere">
              {entry.action}
            </code>
          ) : null}
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
