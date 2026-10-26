"use client";

import { AnimatePresence, motion } from "motion/react";
import { staggerGroup } from "@/lib/motion";
import type { ProjectSummary } from "@/lib/store/selectors";
import { ProjectCard, type ProjectCardActions } from "./ProjectCard";

interface ProjectGridProps extends ProjectCardActions {
  summaries: readonly ProjectSummary[];
  canMove: boolean;
  now: number;
}

const stagger = staggerGroup();

/**
 * Responsive card grid; cards stagger in on mount, glide to their new places when re-sorted
 * (`layout` on each card, off with reduced motion) and animate out when removed or filtered.
 */
export function ProjectGrid({ summaries, canMove, now, ...actions }: ProjectGridProps) {
  return (
    <motion.ul
      variants={stagger}
      initial="hidden"
      animate="visible"
      aria-label="Projects"
      // `relative`: popLayout positions exiting cards against this list.
      className="relative grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-4"
    >
      <AnimatePresence mode="popLayout">
        {summaries.map((summary) => (
          <ProjectCard
            key={summary.project.id}
            summary={summary}
            canMove={canMove}
            now={now}
            {...actions}
          />
        ))}
      </AnimatePresence>
    </motion.ul>
  );
}
