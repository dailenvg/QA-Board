"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { LargeProject } from "@/lib/account/schemas";
import { formatBytes } from "@/lib/account/storage-level";
import { arrowNudge, rowPress } from "@/lib/motion";
import { projectHref } from "@/lib/routes";
import { Icon } from "../ui/Icon";
import { fileCount, STORAGE_COPY } from "./storage-copy";
import { useDeleteDate } from "./use-delete-date";

const COPY = STORAGE_COPY.large;
const MotionLink = motion.create(Link);

const ROW = "flex min-h-11 items-center gap-3 rounded-row px-3 py-2";

/** Archived or in the trash: a soft pill. The trash's reads as a warning. */
const CHIP: Record<Exclude<LargeProject["status"], "live">, { label: string; tint: string }> = {
  archived: { label: COPY.archived, tint: "bg-seg text-ink-2" },
  trashed: { label: COPY.trashed, tint: "bg-danger-soft text-danger" },
};

/**
 * One project in "Large projects": its name, size and files, and for an
 * archived or trashed one a chip and the date it's deleted for good. A live
 * or archived project links to it, tinting on hover or focus and giving on
 * press (the tint stays with reduced motion); a trashed one can't be opened,
 * so it's plain text.
 */
export function LargeProjectRow({ project }: { project: LargeProject }) {
  const reduce = useReducedMotion() ?? false;
  const body = <RowBody project={project} />;
  if (project.status === "trashed") {
    return (
      <div className={ROW} data-testid="large-project" data-status={project.status}>
        {body}
      </div>
    );
  }
  const motionProps = reduce
    ? {}
    : {
        variants: rowPress,
        initial: "rest",
        animate: "rest",
        whileHover: "hover",
        whileFocus: "hover",
        whileTap: "press",
      };
  return (
    <MotionLink
      href={projectHref(project.id)}
      data-testid="large-project"
      data-status={project.status}
      {...motionProps}
      className={`${ROW} transition-colors hover:bg-hover focus-visible:-outline-offset-2 active:bg-seg`}
    >
      {body}
      <motion.span variants={reduce ? undefined : arrowNudge} className="shrink-0 text-muted">
        <Icon name="chevronRight" className="size-4" />
      </motion.span>
    </MotionLink>
  );
}

function RowBody({ project }: { project: LargeProject }) {
  const chip = project.status === "live" ? null : CHIP[project.status];
  return (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-tile bg-tile text-ink-2">
        <Icon name="folder" className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-nav font-semibold text-ink">{project.name}</span>
          {chip ? (
            <span
              className={`shrink-0 rounded-pill px-2 py-0.5 text-label font-semibold whitespace-nowrap ${chip.tint}`}
              data-testid="large-project-chip"
            >
              {chip.label}
            </span>
          ) : null}
        </span>
        <span className="text-meta text-muted tabular-nums">
          {formatBytes(project.bytes)} · {fileCount(project.files)}
        </span>
        {project.deleteAfter === null ? null : <DeletesOn at={project.deleteAfter} />}
      </span>
    </>
  );
}

function DeletesOn({ at }: { at: number }) {
  const date = useDeleteDate(at);
  return (
    <span className="text-meta text-muted" data-testid="large-project-deletes">
      <time dateTime={new Date(at).toISOString()}>{COPY.deletesOn(date)}</time>
    </span>
  );
}
