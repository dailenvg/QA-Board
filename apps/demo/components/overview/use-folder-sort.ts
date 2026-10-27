import { createStoredSort } from "../dashboard/use-stored-sort";
import { FOLDER_SORT } from "./folder-sort";

/** The Overview's folder order, kept across visits apart from the folder pages' project order. */
export const useFolderSort = createStoredSort("squint:folder-sort", FOLDER_SORT);
