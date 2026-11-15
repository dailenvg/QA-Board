import { Skeleton } from "../ui/Skeleton";

interface SettingsCardSkeletonProps {
  /** How many lines of content follow the header. */
  rows: number;
  /** Each line as a list row (a 40px circle, then two lines of text), as in Members. */
  variant?: "line" | "row";
}

/** A row's placeholder: its avatar, then a name and a line under it. */
function RowSkeleton() {
  return (
    <div className="flex min-h-11 items-center gap-3 px-3 py-2">
      <Skeleton className="size-10 shrink-0 rounded-pill" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-40 max-w-full" />
        <Skeleton className="h-3 w-56 max-w-full" />
      </div>
    </div>
  );
}

/** A settings card's placeholder: icon, title and description, then `rows` of content. */
export function SettingsCardSkeleton({ rows, variant = "line" }: SettingsCardSkeletonProps) {
  return (
    <div className="flex flex-col gap-5 rounded-card bg-card p-5 shadow-seg sm:p-6">
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 shrink-0 rounded-pill" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-full max-w-sm" />
        </div>
      </div>
      {Array.from({ length: rows }, (_, index) =>
        variant === "row" ? (
          <RowSkeleton key={index} />
        ) : (
          <Skeleton key={index} className="h-10 w-full" />
        ),
      )}
    </div>
  );
}
