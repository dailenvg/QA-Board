import { Skeleton } from "../ui/Skeleton";

interface SidebarSkeletonProps {
  /** Hold the phone search's place in the header; false where there's no search (account). */
  search?: boolean;
}

/** Sidebar placeholder while the workspace loads. The page beside it announces the loading. */
export function SidebarSkeleton({ search = true }: SidebarSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-5 rounded-panel bg-panel p-4 lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)] lg:w-sidebar lg:shrink-0"
    >
      {/* The header as it loads in: logo, then below lg the search and the theme toggle. */}
      <div className="flex min-h-11 items-center gap-2 px-2">
        <Skeleton className="mr-auto h-11 w-40" />
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
      <Skeleton className="h-11 w-32 lg:w-full" />
      <div className="flex gap-2 lg:flex-col">
        <Skeleton className="h-11 w-32 lg:w-full" />
        <Skeleton className="h-11 w-32 lg:w-full" />
      </div>
      {/* The profile card, at the foot of the panel. */}
      <Skeleton className="mt-auto h-15 w-full rounded-card" />
    </div>
  );
}
