"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { hoverLift, useRevealVariants } from "@/lib/motion";
import { relativeTime } from "@/lib/relative-time";
import { projectHref } from "@/lib/routes";
import type { ProjectSummary } from "@/lib/store/selectors";
import type { Project } from "@/lib/store/types";
import { Icon } from "../ui/Icon";
import { Menu } from "../ui/Menu";
import { StatusChip } from "../ui/StatusChip";
import { sourceLabel } from "./project-source";
import { ProjectThumbnail } from "./ProjectThumbnail";
import { ProjectTypeTag } from "./ProjectTypeTag";

export interface ProjectCardActions {
  onRename: (project: Project) => void;
  onMove: (project: Project) => void;
  onDelete: (project: Project) => void;
}

interface ProjectCardProps extends ProjectCardActions {
  summary: ProjectSummary;
  canMove: boolean;
  now: number;
}

/**
 * Project tile. The whole card opens the viewer, its type tag included; the overflow menu sits
 * above the link.
 */
export function ProjectCard({
  summary,
  canMove,
  now,
  onRename,
  onMove,
  onDelete,
}: ProjectCardProps) {
  const { project, counts, status, previewKey } = summary;
  const reduce = useReducedMotion();
  const variants = useRevealVariants();

  return (
    <motion.li
      layout={reduce ? false : "position"}
      variants={variants}
      exit="exit"
      {...(reduce ? {} : hoverLift)}
      data-testid="project-card"
      // Hover draws a 2px brand line (pointers only: Tailwind's hover skips touch). brand-text is
      // the brand blue as each theme draws lines and text: cobalt in light; in dark the lighter
      // brand blue, 9:1 on the page where cobalt is under 3:1. Keyboard focus wins over it (higher
      // specificity) and stays distinct: set off from the card by a 2px gap.
      className="group relative flex flex-col gap-3 rounded-panel bg-tile p-3 pb-4 ring-2 ring-transparent transition-shadow duration-200 ease-out hover:shadow-float hover:ring-brand-text has-[a:focus-visible]:ring-focus has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-bg has-[[aria-expanded=true]]:z-20"
    >
      <ProjectThumbnail source={project.source} previewKey={previewKey} />
      <div className="flex items-start justify-between gap-2 pl-2">
        <div className="min-w-0 pt-1">
          {/* h2: card titles sit directly under the folder's h1 (no level skipped). */}
          <h2 className="truncate text-heading font-semibold">
            <Link
              href={projectHref(project.id)}
              className="after:absolute after:inset-0 after:rounded-panel focus-visible:outline-none"
            >
              {project.name}
              <ProjectTypeTag source={project.source} />
            </Link>
          </h2>
          <p className="truncate text-meta text-muted">{sourceLabel(project)}</p>
        </div>
        <Menu
          className="relative z-10 -mr-1"
          label={`Actions for ${project.name}`}
          testId="project-menu"
          items={[
            { label: "Rename", icon: "pencil", onSelect: () => onRename(project) },
            {
              label: "Move to folder",
              icon: "folder",
              onSelect: () => onMove(project),
              disabled: !canMove,
            },
            { label: "Delete", icon: "trash", onSelect: () => onDelete(project), danger: true },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-2">
        <StatusChip status={status} />
        <p className="flex items-center gap-3 text-meta text-muted">
          <span className="inline-flex items-center gap-1" title="Active and resolved comments">
            <Icon name="message" className="size-3.5" />
            <span className="tabular-nums">
              {counts.active}
              <span className="sr-only"> active,</span>
              {counts.resolved > 0 ? (
                <>
                  <span aria-hidden="true"> · </span>
                  {counts.resolved}
                  <span className="sr-only"> resolved</span>
                </>
              ) : null}
            </span>
          </span>
          <span>{relativeTime(project.updatedAt, now)}</span>
        </p>
      </div>
    </motion.li>
  );
}
