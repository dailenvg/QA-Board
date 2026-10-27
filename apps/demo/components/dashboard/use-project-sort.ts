import { PROJECT_SORT } from "./project-sort";
import { createStoredSort } from "./use-stored-sort";

/** The folder pages' project order: one choice for every folder, kept across visits. */
export const useProjectSort = createStoredSort("squint:project-sort", PROJECT_SORT);
