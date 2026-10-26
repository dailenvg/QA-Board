"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { paletteForCell } from "@/lib/brand-palette";
import { subtreeIds } from "@/lib/store/folders";
import type { Folder } from "@/lib/store/types";
import { staggerGroup } from "@/lib/motion";
import { useMediaQuery } from "@/lib/use-media-query";
import { useTheme } from "@/lib/use-theme";
import type { Workspace } from "../dashboard/workspace-context";
import { FolderCard } from "./FolderCard";
import { folderFiles, projectCountLabel } from "./folder-files";
import { FOLDER_GRID, FOLDER_GRID_COLUMNS } from "./folder-grid-classes";

const stagger = staggerGroup(0.08, 0.12);

/** How many columns FOLDER_GRID shows at the current viewport width. */
function useGridColumns(): number {
  const [xxl, xl, lg, sm] = FOLDER_GRID_COLUMNS;
  const matches = [
    useMediaQuery(xxl.query),
    useMediaQuery(xl.query),
    useMediaQuery(lg.query),
    useMediaQuery(sm.query),
  ];
  const step = FOLDER_GRID_COLUMNS.find((_, i) => matches[i]);
  return step?.columns ?? 1;
}

interface FolderGridProps {
  workspace: Workspace;
  /** The folders to show: the top level on the Overview, a folder's subfolders on its page. */
  folders: readonly Folder[];
  /** Id of the heading that names the grid. */
  labelledBy: string;
}

/**
 * Folders as glass folder cards, the newest projects inside each (its
 * subfolders' included, and counted). Each folder's color comes from its cell
 * in the grid, so no two folders in a row or column share one.
 */
export function FolderGrid({ workspace, folders, labelledBy }: FolderGridProps) {
  const { data } = workspace;
  const tone = useTheme();
  const columns = useGridColumns();
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
            swatch={paletteForCell(index, columns)}
            tone={tone}
            actions={workspace.folderActions(folder)}
          />
        ))}
      </AnimatePresence>
    </motion.ul>
  );
}
