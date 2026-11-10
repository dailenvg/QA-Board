"use client";

import { motion } from "motion/react";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import type { Workspace } from "../dashboard/workspace-context";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { PauseToggle } from "./welcome/PauseToggle";
import { useStoryPlayback } from "./welcome/use-story-playback";
import { WelcomeStories } from "./welcome/WelcomeStories";

const stagger = staggerGroup(0.07, 0.2);

/** The first step: a folder when there are none yet, else a project. */
const FIRST_STEP = {
  folder: {
    status: "No folders yet. Create one to hold your projects, then add your first project to it.",
    icon: "folderPlus",
    label: "Create your first folder",
  },
  project: {
    status: "No projects yet. Once you add one, it shows up here.",
    icon: "plus",
    label: "Add your first project",
  },
} as const;

interface OverviewEmptyProps {
  /** The first step is a folder while it has none, else a project. */
  workspace: Workspace;
}

/**
 * No projects anywhere yet: the welcome's second half (on the Overview, and
 * in place of the folder grid on Folders). How Squint works, told
 * in three short stories, then the first step. Headed "How it works" so it
 * reads as part of the welcome above it; the line under the heading still
 * says what's missing (and where things will appear once they exist).
 */
export function OverviewEmpty({ workspace }: OverviewEmptyProps) {
  const firstStep: keyof typeof FIRST_STEP = workspace.folders.length ? "project" : "folder";
  const step = FIRST_STEP[firstStep];
  const onAction = () =>
    firstStep === "project" ? workspace.openNewProject() : workspace.newFolder(null);
  const reveal = useRevealVariants();
  const playback = useStoryPlayback();
  return (
    <motion.section
      variants={stagger}
      initial="hidden"
      animate="visible"
      aria-labelledby="overview-empty-title"
      data-testid="overview-empty"
      className="flex flex-1 flex-col gap-6 rounded-panel bg-tile p-4 sm:p-6"
    >
      <div className="flex flex-col gap-2 px-1 pt-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <motion.div variants={reveal} className="max-w-md">
          <h2 id="overview-empty-title" className="text-title font-bold">
            How it works
          </h2>
          <p className="mt-1 text-body text-muted">{step.status}</p>
        </motion.div>
        {!playback.reduced && (
          // Ghost: nudged outward so its label, not its hover fill, lines up with the edge.
          <motion.div variants={reveal} className="-ml-3 sm:-mr-3 sm:ml-0">
            <PauseToggle paused={playback.paused} onChange={playback.setPaused} />
          </motion.div>
        )}
      </div>
      <WelcomeStories playback={playback} />
      {/*
       * The panel's one action: the stories above explain, this starts. Secondary, as the
       * toolbar's (or sidebar's) New project is the screen's one primary action.
       */}
      <motion.div variants={reveal} className="flex justify-center">
        <Button
          variant="secondary"
          onClick={onAction}
          data-testid="overview-empty-action"
          data-step={firstStep}
        >
          <Icon name={step.icon} className="size-5" />
          {step.label}
        </Button>
      </motion.div>
    </motion.section>
  );
}
