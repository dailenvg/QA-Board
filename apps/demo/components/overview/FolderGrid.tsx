"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { paletteForCell } from "@/lib/brand-palette";
import { staggerGroup } from "@/lib/motion";
import { useMediaQuery } from "@/lib/use-media-query";
import { useTheme } from "@/lib/use-theme";
import type { Workspace } from "../dashboard/workspace-context";
import { FolderCard } from "./FolderCard";
import { folderFiles } from "./folder-files";
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

/**
 * Every folder as a glass folder card, newest projects inside. Each folder's
 * color comes from its cell in the grid, so no two folders in a row or column
 * share one.
 */
export function FolderGrid({ workspace }: { workspace: Workspace }) {
  const { data, folders } = workspace;
  const tone = useTheme();
  const columns = useGridColumns();
  const files = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folderFiles(data, folder.id)])),
    [data, folders],
  );

  return (
    <section aria-labelledby="folders-overview-heading" className="flex flex-col">
      <h2 id="folders-overview-heading" className="sr-only">
        Folders
      </h2>
      <motion.ul
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
              files={files.get(folder.id) ?? []}
              index={index}
              swatch={paletteForCell(index, columns)}
              tone={tone}
              canDelete={folders.length > 1}
              onRename={() => workspace.renameFolder(folder)}
              onDelete={() => workspace.deleteFolder(folder)}
            />
          ))}
        </AnimatePresence>
      </motion.ul>
    </section>
  );
}
