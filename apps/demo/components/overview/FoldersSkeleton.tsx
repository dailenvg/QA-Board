import { Skeleton } from "../ui/Skeleton";
import { FOLDER_GRID } from "./folder-grid-classes";
import { FOLDER_MAX_WIDTH } from "./glass-folder/geometry";

const FOLDERS = 3;

/**
 * `/folders` placeholder: the heading and its summary, the sort row, then
 * folder-shaped cards. The sort row is reserved even though it only shows with
 * two or more folders (unknown until the workspace loads): most workspaces
 * have them, and a row that appears late would push every folder down.
 */
export function FoldersSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Loading your folders…</span>
      {/* FoldersView's header: the title's line (text-title, 25 to 30px), then the chips. */}
      <div className="flex flex-col gap-1 pt-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-6 w-48 rounded-pill" />
      </div>
      {/*
        Matches OverviewFolders' controls: the status filter, then sort's menu and order
        (icon-only on phones) at the right, dropping below the filter on narrow screens.
      */}
      <div className="-mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 [@media(hover:none)]:pb-10">
        <Skeleton className="h-13 w-84 max-w-full rounded-pill" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-11 w-44 rounded-pill" />
          <Skeleton className="h-11 w-11 rounded-pill sm:w-36" />
        </div>
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
