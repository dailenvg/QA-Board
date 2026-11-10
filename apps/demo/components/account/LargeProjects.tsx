"use client";

import { motion } from "motion/react";
import type { LargeProject } from "@/lib/account/schemas";
import { revealViewport, staggerGroup, useRevealVariants } from "@/lib/motion";
import { Squiggy } from "../brand/mascot/Squiggy";
import { LargeProjectRow } from "./LargeProjectRow";
import { SettingsCard } from "./SettingsCard";
import { STORAGE_COPY } from "./storage-copy";

const COPY = STORAGE_COPY.large;
const GROUP = staggerGroup();

/** The workspace's biggest projects, biggest first, or a resting Squiggy when none stores anything. */
export function LargeProjects({ projects }: { projects: readonly LargeProject[] }) {
  const variants = useRevealVariants();
  return (
    <SettingsCard
      title={COPY.title}
      description={COPY.description}
      icon="folder"
      testId="large-projects"
    >
      {projects.length === 0 ? (
        <div
          className="flex flex-col items-center gap-3 rounded-tile bg-tile px-6 py-8 text-center"
          data-testid="large-projects-empty"
        >
          <Squiggy mood="idle" size={88} still />
          <div className="flex flex-col gap-1">
            <p className="text-heading font-semibold">{COPY.emptyTitle}</p>
            <p className="text-body text-pretty text-muted">{COPY.emptyBody}</p>
          </div>
        </div>
      ) : (
        <motion.ol
          variants={GROUP}
          initial="hidden"
          whileInView="visible"
          viewport={revealViewport}
          className="-mx-3 flex flex-col gap-1"
        >
          {projects.map((project) => (
            <motion.li key={project.id} variants={variants}>
              <LargeProjectRow project={project} />
            </motion.li>
          ))}
        </motion.ol>
      )}
    </SettingsCard>
  );
}
