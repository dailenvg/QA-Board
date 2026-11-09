import { Skeleton } from "../ui/Skeleton";

interface SidebarSkeletonProps {
  /** Hold the phone search's place in the header; false where there's no search (account). */
  search?: boolean;
  /** Hold the folder tree's place: it opens under Folders in the Folders section. */
  tree?: boolean;
}

/** Sidebar placeholder while the workspace loads. The page beside it announces the loading. */
export function SidebarSkeleton({ search = true, tree = false }: SidebarSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-5 rounded-panel bg-panel p-4 lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)] lg:w-sidebar lg:shrink-0"
    >
      {/* The header as it loads in: the brand panel, then below lg the search and theme toggle. */}
      <div className="flex min-h-11 items-center gap-2">
        <Skeleton className="mr-auto h-14 w-44 rounded-card lg:mr-0 lg:h-18 lg:flex-1" />
        {search ? (
          <Skeleton className="size-11 rounded-pill sm:w-72 sm:rounded-field lg:hidden" />
        ) : null}
        <Skeleton className="size-11 rounded-pill lg:hidden" />
      </div>
      {/* New project and New folder (icon-only on phones); the page's toolbar has them at lg. */}
      <div className="flex gap-2 lg:hidden">
        <Skeleton className="h-11 flex-1 rounded-pill" />
        <Skeleton className="size-11 rounded-pill sm:w-38" />
      </div>
      {/* Overview and Folders, then (in the Folders section) the open tree. */}
      <div className="flex flex-col gap-1">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        {tree ? (
          <div className="flex flex-col gap-1 pt-1 pl-2">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : null}
      </div>
      {/* The profile card, at the foot of the panel. */}
      <Skeleton className="mt-auto h-15 w-full rounded-card" />
    </div>
  );
}
