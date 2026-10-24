import { Skeleton } from "../ui/Skeleton";

/** Sidebar placeholder while browser storage is read. The page beside it announces the loading. */
export function SidebarSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-5 rounded-panel bg-panel p-4 lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)] lg:w-sidebar lg:shrink-0"
    >
      <Skeleton className="h-11 w-40" />
      <Skeleton className="h-11 rounded-pill" />
      <Skeleton className="h-11 w-32 lg:w-full" />
      <div className="flex gap-2 lg:flex-col">
        <Skeleton className="h-11 w-32 lg:w-full" />
        <Skeleton className="h-11 w-32 lg:w-full" />
      </div>
    </div>
  );
}
