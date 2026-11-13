"use client";

import { motion } from "motion/react";
import { useRevealVariants } from "@/lib/motion";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { StateArt, type ArtScene } from "../ui/line-art/StateArt";

/**
 * `folder`: nothing in this folder yet. `filter`: none of its projects matches the status
 * filter, `archived`: none is archived, `label`: none matches the label (and status) chosen.
 * `folders`, `foldersArchived` and `foldersLabel`: the same, for the folders on Folders.
 */
export type DashboardEmptyKind =
  "folder" | "filter" | "archived" | "label" | "folders" | "foldersArchived" | "foldersLabel";

interface DashboardEmptyProps {
  kind: DashboardEmptyKind;
  onAction: () => void;
}

const COPY = {
  folder: {
    title: "Nothing to review yet",
    body: "Add a website, images or a PDF, then drop pins to leave feedback.",
    action: "New project",
  },
  filter: {
    title: "No projects with this status",
    body: "Try another filter, or show every project in this folder.",
    action: "Show all",
  },
  folders: {
    title: "No projects with this status",
    body: "Try another filter, or show every folder.",
    action: "Show all",
  },
  archived: {
    title: "No archived projects",
    body: "Projects you archive in this folder wait here until they're deleted for good.",
    action: "Show all",
  },
  foldersArchived: {
    title: "No archived projects",
    body: "Projects you archive wait here until they're deleted for good.",
    action: "Show all",
  },
  label: {
    title: "No projects match these filters",
    body: "Try another label or status, or show every project in this folder.",
    action: "Show all",
  },
  foldersLabel: {
    title: "No projects match these filters",
    body: "Try another label or status, or show every folder.",
    action: "Show all",
  },
} as const satisfies Record<DashboardEmptyKind, { title: string; body: string; action: string }>;

/** Each kind's line-art scene: the empty folder, nothing archived, or no match. */
const SCENE = {
  folder: "folder",
  filter: "noMatch",
  folders: "noMatch",
  archived: "archive",
  foldersArchived: "archive",
  label: "noMatch",
  foldersLabel: "noMatch",
} as const satisfies Record<DashboardEmptyKind, ArtScene>;

/** Empty folder or empty filter result, over its line-art scene (`StateArt`). */
export function DashboardEmpty({ kind, onAction }: DashboardEmptyProps) {
  const variants = useRevealVariants();
  const copy = COPY[kind];
  return (
    <motion.section
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      data-testid="dashboard-empty"
      className="grid flex-1 place-items-center rounded-panel bg-tile px-6 py-14 text-center"
    >
      <div className="flex max-w-sm flex-col items-center gap-4">
        <StateArt scene={SCENE[kind]} surface="tile" />
        <div>
          <h2 className="text-title font-bold">{copy.title}</h2>
          <p className="mt-2 text-body text-muted">{copy.body}</p>
        </div>
        <Button onClick={onAction} variant={kind === "folder" ? "primary" : "secondary"}>
          {kind === "folder" ? <Icon name="plus" className="size-5" /> : null}
          {copy.action}
        </Button>
      </div>
    </motion.section>
  );
}
