import { Skeleton } from "../ui/Skeleton";
import { FOLDER_GRID } from "./folder-grid-classes";
import { FOLDER_MAX_WIDTH } from "./glass-folder/geometry";

const FOLDERS = 3;

/**
 * Overview placeholder: the hero, the sort row, then folder-shaped cards. The
 * sort row is reserved even though it only shows with two or more folders
 * (unknown until the workspace loads): most workspaces have them, and a row
 * that appears late would push every folder down.
 */
export function OverviewSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Loading your folders…</span>
      <div className="flex flex-col items-center gap-5 rounded-panel bg-panel px-6 py-8 sm:flex-row sm:gap-8 sm:px-10">
        <Skeleton className="size-28 shrink-0 rounded-pill sm:size-32" />
        <div className="flex w-full flex-col items-center gap-3 sm:items-start">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full max-w-sm" />
          <Skeleton className="h-5 w-full max-w-md" />
        </div>
      </div>
      {/* Matches OverviewFolders' sort row: the menu, then the order (icon-only on phones). */}
      <div className="-mb-4 flex justify-center gap-2 px-4 sm:justify-end [@media(hover:none)]:pb-10">
        <Skeleton className="h-11 w-44 rounded-pill" />
        <Skeleton className="h-11 w-11 rounded-pill sm:w-36" />
      </div>
      <div className={FOLDER_GRID}>
        {Array.from({ length: FOLDERS }, (_, index) => (
          // Matches FolderCard: a box of FOLDER_ASPECT (340 / 326) whose top 54/340 is the
          // folder's empty headroom, so only the folder body is drawn. Where nothing hovers
          // the card drops that headroom (340 / 272), and so does this.
          <div
            key={index}
            className="flex aspect-[340/326] w-full flex-col [@media(hover:none)]:aspect-[340/272]"
            style={{ maxWidth: FOLDER_MAX_WIDTH }}
          >
            <Skeleton className="mt-[15.88%] flex-1 rounded-panel [@media(hover:none)]:mt-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
