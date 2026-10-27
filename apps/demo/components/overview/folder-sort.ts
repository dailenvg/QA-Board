import { projectsInside } from "@/lib/store/folders";
import type { Folder, SquintData } from "@/lib/store/types";
import {
  nameCollator,
  type SortChoice,
  type SortDirection,
  type SortOptions,
  type SortSpec,
} from "../dashboard/sort-choice";

export type FolderSortKey = "updated" | "name" | "projects" | "comments";

export type FolderSort = SortChoice<FolderSortKey>;

/** What the Overview sorts a folder by; everything inside counts, subfolders included. */
export interface FolderStats {
  folder: Folder;
  /** The newest activity of any project inside, else when the folder was made. */
  updatedAt: number;
  projects: number;
  /** Whether any project inside has an open comment. */
  openComments: boolean;
}

const FOLDER_SORT_KEYS: readonly FolderSortKey[] = ["updated", "name", "projects", "comments"];

const FOLDER_SORT_SPECS: Record<FolderSortKey, SortSpec> = {
  updated: {
    label: "Last updated",
    natural: "desc",
    order: { desc: "Newest first", asc: "Oldest first" },
  },
  name: { label: "Name", natural: "asc", order: { asc: "A to Z", desc: "Z to A" } },
  projects: {
    label: "Most projects",
    natural: "desc",
    order: { desc: "Most first", asc: "Fewest first" },
  },
  comments: {
    label: "Open comments first",
    natural: "asc",
    order: { asc: "Open comments first", desc: "Open comments last" },
  },
};

export const FOLDER_SORT: SortOptions<FolderSortKey> = {
  keys: FOLDER_SORT_KEYS,
  specs: FOLDER_SORT_SPECS,
  fallback: { key: "updated", direction: FOLDER_SORT_SPECS.updated.natural },
};

/** Each folder with what it's sorted by, in the folders' order. */
export function folderStats(data: SquintData, folders: readonly Folder[]): FolderStats[] {
  const open = new Set(
    data.comments
      .filter((comment) => comment.status === "active")
      .map((comment) => comment.projectId),
  );
  return folders.map((folder) => {
    const projects = projectsInside(data, folder.id);
    return {
      folder,
      updatedAt: projects.length
        ? Math.max(...projects.map((project) => project.updatedAt))
        : folder.createdAt,
      projects: projects.length,
      openComments: projects.some((project) => open.has(project.id)),
    };
  });
}

type Compare = (a: FolderStats, b: FolderStats) => number;

const byName: Compare = (a, b) => nameCollator.compare(a.folder.name, b.folder.name);
const byUpdated: Compare = (a, b) => a.updatedAt - b.updatedAt;
const newestFirst: Compare = (a, b) => byUpdated(b, a);
const byProjects: Compare = (a, b) => a.projects - b.projects;
const byOpenComments: Compare = (a, b) => Number(b.openComments) - Number(a.openComments);

/** Each key's primary order (ascending) and the tie-break that applies in both directions. */
const COMPARE: Record<FolderSortKey, { primary: Compare; tie: Compare }> = {
  updated: { primary: byUpdated, tie: byName },
  name: { primary: byName, tie: newestFirst },
  projects: { primary: byProjects, tie: byName },
  comments: { primary: byOpenComments, tie: newestFirst },
};

/**
 * The folders in a sorted copy. Reversing flips only the primary order: ties
 * keep their tie-break (then their input order), as on folder pages.
 */
export function sortFolders(
  stats: readonly FolderStats[],
  key: FolderSortKey,
  direction: SortDirection,
): Folder[] {
  const { primary, tie } = COMPARE[key];
  const sign = direction === "asc" ? 1 : -1;
  return [...stats].sort((a, b) => sign * primary(a, b) || tie(a, b)).map(({ folder }) => folder);
}
