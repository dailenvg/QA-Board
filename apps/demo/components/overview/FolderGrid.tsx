"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { folderColor, folderSwatches } from "@/lib/brand-palette";
import { subtreeIds } from "@/lib/store/folders";
import type { Folder } from "@/lib/store/types";
import { staggerGroup } from "@/lib/motion";
import { useTheme } from "@/lib/use-theme";
import type { Workspace } from "../dashboard/workspace-context";
import { FolderCard } from "./FolderCard";
import { folderFiles, projectCountLabel } from "./folder-files";
import { FOLDER_GRID } from "./folder-grid-classes";

const stagger = staggerGroup(0.08, 0.12);

interface FolderGridProps {
  workspace: Workspace;
  /** The folders to show: the top level on the Overview, a folder's subfolders on its page. */
  folders: readonly Folder[];
  /** Id of the heading that names the grid. */
  labelledBy: string;
}

/**
 * Folders as glass folder cards, the newest projects inside each (its
 * subfolders' included, and counted). Each folder keeps its own color
 * (folderSwatches: its place in creation order among its siblings), so a new
 * sort order moves folders without recoloring them.
 */
export function FolderGrid({ workspace, folders, labelledBy }: FolderGridProps) {
  const { data } = workspace;
  const tone = useTheme();
  const swatches = useMemo(() => folderSwatches(workspace.folders), [workspace.folders]);
  const cards = useMemo(
    () =>
      new Map(
        folders.map((folder) => {
          const files = folderFiles(data, folder.id);
          const meta = projectCountLabel(
            files.length,
            subtreeIds(data.folders, folder.id).size > 1,
          );
          return [folder.id, { files, meta }];
        }),
      ),
    [data, folders],
  );

  return (
    <motion.ul
      aria-labelledby={labelledBy}
      variants={stagger}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-10%" }}
      // `relative`: popLayout positions exiting cards against this list.
      className={`relative ${FOLDER_GRID}`}
    >
      <AnimatePresence mode="popLayout">
        {folders.map((folder, index) => (
          <FolderCard
            key={folder.id}
            folder={folder}
            files={cards.get(folder.id)?.files ?? []}
            meta={cards.get(folder.id)?.meta ?? ""}
            index={index}
            swatch={swatches.get(folder.id) ?? folderColor(index)}
            tone={tone}
            actions={workspace.folderActions(folder)}
          />
        ))}
      </AnimatePresence>
    </motion.ul>
  );
}
