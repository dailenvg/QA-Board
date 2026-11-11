"use client";

import { motion } from "motion/react";
import { childFolders } from "@/lib/store/folders";
import { staggerGroup, useRevealVariants } from "@/lib/motion";
import { useWorkspace } from "../dashboard/workspace-context";
import { FoldersSkeleton } from "./FoldersSkeleton";
import { OverviewEmpty } from "./OverviewEmpty";
import { OverviewFolders } from "./OverviewFolders";

const stagger = staggerGroup(0.07, 0.05);

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * `/folders`: every top-level folder as a glass folder (its count includes its
 * subfolders' projects, archived ones aside), in the order chosen above them.
 * With no projects at all, archived or not, the short guide the Overview shows
 * replaces the grid.
 */
export function FoldersView() {
  const workspace = useWorkspace();
  const reveal = useRevealVariants();
  if (!workspace) return <FoldersSkeleton />;
  const { data, allData, folders } = workspace;
  // Only archived projects: the grid stays, so its Archived filter can show them.
  const empty = allData.projects.length === 0;
  const chips = [
    plural(childFolders(folders, null).length, "folder"),
    plural(data.projects.length, "project"),
  ];
  return (
    <>
      <motion.header
        variants={stagger}
        initial="hidden"
        animate="visible"
        data-testid="folders-header"
        className="flex flex-col gap-1 pt-2"
      >
        <motion.h1 variants={reveal} className="text-title font-bold">
          Folders
        </motion.h1>
        {empty ? null : (
          <motion.ul
            variants={reveal}
            className="flex flex-wrap gap-2"
            aria-label="Folders summary"
          >
            {chips.map((chip) => (
              <li
                key={chip}
                className="rounded-pill bg-panel px-3 py-1 text-label font-medium text-ink-2"
              >
                {chip}
              </li>
            ))}
          </motion.ul>
        )}
      </motion.header>
      {empty ? <OverviewEmpty workspace={workspace} /> : <OverviewFolders workspace={workspace} />}
    </>
  );
}
